// Reads a trader's numbers from Hyperliquid's documented info API (type "portfolio").
// Reuses the fetch helper from the wallet checker (agents/walletRules.js).
import { hlInfo } from '../../agents/walletRules.js';
export { hlInfo };

const toPts = (s) => (s?.accountValueHistory || []).map(([t, av], i) => ({ t, av: Number(av), pnl: Number(s.pnlHistory?.[i]?.[1] ?? 0) }));

// Returns { now: {t, pnl, av}, at(ms), month: {pnl, roi, startAv}, week: {...} } or null if the API is unreachable.
// pnl is CUMULATIVE all-time PnL in USD. Hyperliquid's pnlHistory already excludes deposits and withdrawals,
// so the difference of two readings is trading PnL (realized + unrealized, after fees and funding).
export async function getPortfolio(address, { info = hlInfo } = {}) {
  const raw = await info({ type: 'portfolio', user: address });
  if (!Array.isArray(raw)) return null;
  const m = Object.fromEntries(raw);
  const all = toPts(m.allTime);
  if (!all.length) return null;
  const last = all[all.length - 1];
  // The day/week/month series restart at 0 at the window start; shift them onto the all-time scale.
  const shifted = (key) => {
    const pts = toPts(m[key]);
    if (!pts.length) return [];
    const off = last.pnl - pts[pts.length - 1].pnl;
    return pts.map((p) => ({ ...p, pnl: p.pnl + off }));
  };
  const day = shifted('day'), week = shifted('week'), month = shifted('month');
  const window = (pts) => {
    if (!pts.length) return { pnl: 0, roi: 0, startAv: 0 };
    const a = pts[0], b = pts[pts.length - 1];
    const pnl = b.pnl - a.pnl;
    return { pnl, roi: returnOf(a, b).raw, startAv: a.av }; // unclamped, for display and salaries
  };
  return {
    now: { t: last.t, pnl: last.pnl, av: last.av },
    // Best reading at or before time ms (finest series that covers it). Used to backfill a missed snapshot.
    at(ms) {
      for (const pts of [day, week, month, all]) {
        if (pts.length && pts[0].t <= ms) {
          let best = pts[0];
          for (const p of pts) if (p.t <= ms) best = p;
          return { t: best.t, pnl: best.pnl, av: best.av };
        }
      }
      return null;
    },
    month: window(month),
    week: window(week),
    volumeMonth: Number(m.month?.vlm || 0),
  };
}

// --- Scoring of one trader between two readings (see SCORING.md) ---
export const FLOOR_USD = 10000;   // smallest denominator, so a $50 account can't post +5000%
export const MIN_RET = -1, MAX_RET = 2; // clamp each trader to [-100%, +200%] per week
export function returnOf(a, b) {
  const pnl = b.pnl - a.pnl;
  const netFlow = (b.av - a.av) - pnl;            // deposits (+) / withdrawals (-) during the window
  const capital = Math.max(a.av + Math.max(0, netFlow), FLOOR_USD); // deposits raise the base; withdrawals never shrink it
  const raw = pnl / capital;
  const ret = Math.min(MAX_RET, Math.max(MIN_RET, raw));
  return { pnl, netFlow, capital, ret, raw };
}
