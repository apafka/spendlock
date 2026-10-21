// League engine: weeks, snapshots, entries, scores. Pure functions + an injectable API (`info`) so tests run offline.
import { hlInfo, getPortfolio, returnOf } from './hl.js';
import { validateTeam } from './salary.js';
import { weekOf } from './week.js';

const LIVE_GRACE_MS = 15 * 60 * 1000; // a week-start snapshot taken within 15 min of Monday 00:00 UTC counts as live
const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;

async function mapLimit(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

// Current readings { address: {t, pnl, av} } (or a past time `atMs`, read from the portfolio history).
export async function readTraders(addresses, { info = hlInfo, atMs = null } = {}) {
  const res = await mapLimit(addresses, 4, async (a) => {
    const p = await getPortfolio(a, { info });
    return [a, p ? (atMs ? p.at(atMs) : p.now) : null];
  });
  return Object.fromEntries(res.filter(([, v]) => v));
}

// Realized PnL (closedPnl - fees) since a time, from fills. Shown next to the score, not part of it.
export async function realizedSince(address, startTime, { info = hlInfo, endTime = Date.now() } = {}) {
  let total = 0, n = 0, start = startTime;
  for (let page = 0; page < 3; page++) {
    const batch = await info({ type: 'userFillsByTime', user: address, startTime: start, endTime, aggregateByTime: true });
    if (!Array.isArray(batch)) return null;
    for (const f of batch) { total += Number(f.closedPnl || 0) - Number(f.fee || 0); n++; }
    if (batch.length < 2000) break;
    start = Math.max(...batch.map((f) => f.time)) + 1;
  }
  return { realized: total, fills: n };
}

// Creates the week record and its week-start baseline if missing (weekly reset happens here).
export async function ensureWeek(league, pool, { info = hlInfo, now = Date.now() } = {}) {
  const wk = weekOf(now);
  if (league.weeks[wk.key]) return league.weeks[wk.key];
  const addrs = pool.traders.map((t) => t.address);
  const live = now - wk.start <= LIVE_GRACE_MS;
  const baseline = await readTraders(addrs, { info, atMs: live ? null : wk.start });
  league.weeks[wk.key] = {
    key: wk.key, start: wk.start, end: wk.end, pool: addrs,
    baseline: { mode: live ? 'live' : 'backfill', takenAt: now, traders: baseline },
    latest: null, snapshots: [], entries: [], final: false,
  };
  return league.weeks[wk.key];
}

// Pulls fresh numbers for every pool trader and re-scores all entries.
export async function snapshot(week, { info = hlInfo, now = Date.now(), withRealized = true } = {}) {
  const ended = now >= week.end;
  const traders = await readTraders(week.pool, { info, atMs: ended ? week.end : null });
  if (withRealized) {
    const drafted = [...new Set(week.entries.flatMap((e) => e.picks))];
    const real = await mapLimit(drafted, 2, async (a) => [a, await realizedSince(a, week.start, { info, endTime: Math.min(now, week.end) })]);
    for (const [a, r] of real) if (traders[a] && r) Object.assign(traders[a], r);
  }
  week.latest = { takenAt: now, traders };
  week.snapshots.push({ takenAt: now, traders: Object.keys(traders).length });
  if (week.snapshots.length > 500) week.snapshots.shift();
  if (ended) week.final = true;
  return week;
}

export function scoreEntry(entry, week) {
  const latest = week.latest?.traders || {};
  const picks = entry.picks.map((a) => {
    const b = entry.baseline[a], l = latest[a];
    if (!b || !l || l.t < b.t) return { address: a, ret: 0, pnl: 0, pending: true };
    const r = returnOf(b, l);
    return { address: a, ret: r.ret, pnl: r.pnl, netFlow: r.netFlow, realized: l.realized ?? null };
  });
  const ret = picks.reduce((s, p) => s + p.ret, 0) / picks.length;
  return { score: Math.round(ret * 10000) / 100, pnl: Math.round(picks.reduce((s, p) => s + p.pnl, 0)), picks };
}

export function leaderboard(week) {
  if (!week) return [];
  return week.entries.map((e) => ({ player: e.player, sim: !!e.sim, salary: e.salary, enteredAt: e.enteredAt, ...scoreEntry(e, week) }))
    .sort((a, b) => b.score - a.score || b.pnl - a.pnl)
    .map((r, i) => ({ rank: i + 1, ...r }));
}

// One entry per player per week. Late entries start from a FRESH reading at entry time, so nobody can
// draft yesterday's winners and get yesterday's gains. Simulated players (demo only) use the week-start baseline.
export async function addEntry(league, pool, week, { player, wallet = null, picks }, { info = hlInfo, now = Date.now(), sim = false } = {}) {
  if (!NAME_RE.test(player || '')) return { ok: false, error: 'Username: 3-20 letters, numbers or _.' };
  if (now >= week.end) return { ok: false, error: 'This week is over.' };
  const key = player.toLowerCase();
  if (week.entries.some((e) => e.player.toLowerCase() === key)) return { ok: false, error: 'You already have a team this week.' };
  const owner = league.players[key];
  if (owner?.wallet && wallet && owner.wallet !== wallet.toLowerCase()) return { ok: false, error: 'That username belongs to another wallet.' };
  const v = validateTeam(picks, pool.traders.filter((t) => week.pool.includes(t.address)));
  if (!v.ok) return v;
  let baseline;
  if (sim) baseline = Object.fromEntries(v.picks.map((a) => [a, week.baseline.traders[a]]));
  else baseline = await readTraders(v.picks, { info });
  if (v.picks.some((a) => !baseline[a])) return { ok: false, error: 'Hyperliquid API did not answer for a pick; try again.' };
  league.players[key] = { name: player, wallet: wallet ? wallet.toLowerCase() : owner?.wallet || null, createdAt: owner?.createdAt || now, sim: sim || undefined };
  const entry = { player, sim: sim || undefined, picks: v.picks, salary: v.salary, enteredAt: now, baseline };
  week.entries.push(entry);
  return { ok: true, entry };
}
