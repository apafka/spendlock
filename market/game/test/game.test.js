// Offline tests: a fake Hyperliquid API, a temp data dir. node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.GAME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'game-'));
const { returnOf, getPortfolio, FLOOR_USD } = await import('../lib/hl.js');
const { assignSalaries, validateTeam, CAP } = await import('../lib/salary.js');
const { weekOf } = await import('../lib/week.js');
const { ensureWeek, snapshot, addEntry, leaderboard } = await import('../lib/league.js');
const store = await import('../lib/store.js');

const MON = Date.UTC(2026, 9, 19); // Monday 2026-10-19 00:00 UTC
test('week key and bounds', () => {
  const w = weekOf(MON + 10 * 3600e3);
  assert.equal(w.key, '2026-W43'); assert.equal(w.start, MON); assert.equal(w.end, MON + 7 * 86400e3);
  assert.equal(weekOf(MON - 1).key, '2026-W42');
});

test('return: plain gain, deposit does not count as profit, withdrawal does not shrink the base', () => {
  assert.equal(returnOf({ pnl: 0, av: 100000 }, { pnl: 10000, av: 110000 }).ret, 0.1);
  // deposits $100k and makes $10k: return measured on $200k
  const d = returnOf({ pnl: 0, av: 100000 }, { pnl: 10000, av: 210000 });
  assert.equal(d.netFlow, 100000); assert.equal(d.ret, 0.05);
  // withdraws $90k, makes $5k: base stays $100k (no "withdraw then look big" trick)
  assert.equal(returnOf({ pnl: 0, av: 100000 }, { pnl: 5000, av: 15000 }).ret, 0.05);
});
test('return: tiny accounts use the floor, and each trader is clamped to [-100%, +200%]', () => {
  assert.equal(returnOf({ pnl: 0, av: 100 }, { pnl: 1000, av: 1100 }).capital, FLOOR_USD);
  assert.equal(returnOf({ pnl: 0, av: 20000 }, { pnl: 100000, av: 120000 }).ret, 2);
  assert.equal(returnOf({ pnl: 0, av: 20000 }, { pnl: -50000, av: 0 }).ret, -1);
});

const series = (pts) => ({ accountValueHistory: pts.map(([t, av]) => [t, String(av)]), pnlHistory: pts.map(([t, , p]) => [t, String(p)]), vlm: '1' });
// Fake API: each address has an all-time pnl that grows by `rate` per hour after MON.
function fakeInfo(state) {
  return async (body) => {
    const s = state[body.user]; if (!s) return null;
    if (body.type === 'userFillsByTime') return [{ closedPnl: '100', fee: '1', time: MON + 1 }];
    const now = state.now; const h = (now - MON) / 3600e3;
    const cur = s.p0 + s.rate * h;
    const pts = (from) => Array.from({ length: 8 }, (_, i) => from + ((now - from) * i) / 7).map((t) => [t, s.av0 + s.rate * ((t - MON) / 3600e3), s.p0 + s.rate * ((t - MON) / 3600e3)]);
    const rel = (from) => { const p = pts(from); const base = p[0][2]; return series(p.map(([t, av, pnl]) => [t, av, pnl - base])); };
    return [['day', rel(now - 86400e3)], ['week', rel(now - 7 * 86400e3)], ['month', rel(now - 30 * 86400e3)], ['allTime', series(pts(MON - 60 * 86400e3))]];
  };
}

test('portfolio: day/week series are shifted onto the all-time scale; at() reads the past', async () => {
  const st = { now: MON + 12 * 3600e3, a: { p0: 5000, av0: 100000, rate: 100 } };
  const p = await getPortfolio('a', { info: fakeInfo(st) });
  assert.equal(Math.round(p.now.pnl), 5000 + 1200);
  const at = p.at(MON + 6 * 3600e3);
  assert.ok(at.t <= MON + 6 * 3600e3 && Math.abs(at.pnl - (5000 + 100 * (at.t - MON) / 3600e3)) < 1e-6);
});

test('salary cap: top five do not fit; team validation', () => {
  const pool = assignSalaries(Array.from({ length: 10 }, (_, i) => ({ address: `0x${i}`, monthRoi: i / 10, monthPnl: i * 1000 })));
  const top5 = [...pool].sort((a, b) => b.salary - a.salary).slice(0, 5);
  assert.ok(top5.reduce((s, t) => s + t.salary, 0) > CAP);
  assert.equal(validateTeam(top5.map((t) => t.address), pool).ok, false);
  assert.equal(validateTeam(['0x0', '0x1', '0x2', '0x3', '0x3'], pool).ok, false);
  assert.equal(validateTeam(['0x0', '0x1', '0x2', '0x3', '0x4'], pool).ok, true);
});

test('league: backfilled week start, sim + late entries, scores, ranks, one team per player', async () => {
  const addrs = ['a', 'b', 'c', 'd', 'e', 'f'];
  const st = { now: MON + 10 * 3600e3 };
  addrs.forEach((a, i) => (st[a] = { p0: 0, av0: 100000, rate: (i - 2) * 50 }));
  const info = fakeInfo(st);
  const pool = { traders: addrs.map((a) => ({ address: a, salary: 10 })) };
  const league = { players: {}, weeks: {} };
  const w = await ensureWeek(league, pool, { info, now: st.now });
  assert.equal(w.baseline.mode, 'backfill');
  assert.ok((await addEntry(league, pool, w, { player: 'sim_one', picks: ['a', 'b', 'c', 'd', 'e'] }, { info, now: st.now, sim: true })).ok);
  const late = await addEntry(league, pool, w, { player: 'late_lu', picks: ['b', 'c', 'd', 'e', 'f'] }, { info, now: st.now });
  assert.ok(late.ok);
  assert.equal((await addEntry(league, pool, w, { player: 'LATE_LU', picks: ['b', 'c', 'd', 'e', 'f'] }, { info, now: st.now })).ok, false);
  assert.equal((await addEntry(league, pool, w, { player: 'x', picks: ['b', 'c', 'd', 'e', 'f'] }, { info, now: st.now })).ok, false);
  st.now += 10 * 3600e3;
  await snapshot(w, { info, now: st.now });
  const lb = leaderboard(w);
  assert.equal(lb.length, 2);
  // sim_one: 20h of (-100,-50,0,50,100)/h = 0 total; late_lu: 10h of (-50..150)/h -> positive
  assert.equal(lb[0].player, 'late_lu'); assert.ok(lb[0].score > 0);
  assert.ok(Math.abs(lb[1].score) < 0.01);
  assert.equal(w.latest.traders.b.realized, 99);
  // week end freezes the result
  st.now = w.end + 3600e3; await snapshot(w, { info, now: st.now });
  assert.equal(w.final, true);
});

test('store: locked read-modify-write', async () => {
  await Promise.all(Array.from({ length: 10 }, () => store.update('c.json', { n: 0 }, (d) => { d.n++; })));
  assert.equal(store.load('c.json').n, 10);
});
