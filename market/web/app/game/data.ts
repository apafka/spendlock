// Server-side helpers for the fantasy league pages. The engine itself is in /game/lib (shared with the CLI jobs).
// @ts-nocheck
import { loadPool, loadLeague } from '../../../game/lib/store.js';
import { leaderboard } from '../../../game/lib/league.js';
import { returnOf } from '../../../game/lib/hl.js';
import { weekOf } from '../../../game/lib/week.js';
import { CAP, TEAM_SIZE } from '../../../game/lib/salary.js';

export { CAP, TEAM_SIZE };
export function currentWeek() {
  const league = loadLeague();
  const key = weekOf().key;
  const week = league.weeks[key] || Object.values(league.weeks).sort((a: any, b: any) => b.start - a.start)[0] || null;
  return { league, week };
}
// Pool with "this week so far" numbers for each trader.
export function poolWithStats() {
  const pool = loadPool();
  const { week } = currentWeek();
  if (!pool) return null;
  const traders = pool.traders.map((t) => {
    const b = week?.baseline?.traders?.[t.address], l = week?.latest?.traders?.[t.address];
    const wk = b && l ? returnOf(b, l) : null;
    return { ...t, weekRet: wk ? wk.ret : null, weekPnl: wk ? Math.round(wk.pnl) : null };
  });
  return { ...pool, traders, weekKey: week?.key || weekOf().key, updatedAt: week?.latest?.takenAt || null, end: week?.end || weekOf().end };
}
export function board() {
  const { week } = currentWeek();
  const pool = loadPool();
  const nick = Object.fromEntries((pool?.traders || []).map((t) => [t.address, t.nick]));
  const rows = leaderboard(week).map((r) => ({ ...r, picks: r.picks.map((p) => ({ ...p, nick: nick[p.address] || p.address.slice(0, 8) })) }));
  return { week, rows };
}
export const pct = (x: number, d = 2) => (x >= 0 ? '+' : '') + x.toFixed(d) + '%';
export const usd = (x: number) => (x < 0 ? '-$' : '$') + Math.abs(Math.round(x)).toLocaleString('en-US');
export const short = (a: string) => a.slice(0, 6) + '…' + a.slice(-4);
