// Start-of-week job (run Monday 00:00 UTC, safe to re-run): creates the week + baseline, then a live snapshot.
// node scripts/snapshot.js
import { loadPool, updateLeague } from '../lib/store.js';
import { ensureWeek, snapshot } from '../lib/league.js';

const pool = loadPool();
if (!pool) throw new Error('No pool yet: run `node scripts/build-pool.js` first.');
const out = await updateLeague(async (league) => {
  const w = await ensureWeek(league, pool);
  await snapshot(w);
  return w;
});
const bt = Object.values(out.baseline.traders);
console.log(`WEEK    ${out.key} starts ${new Date(out.start).toISOString()} | baseline ${out.baseline.mode} for ${bt.length}/${out.pool.length} traders` +
  (out.baseline.mode === 'backfill' ? ` (readings from ${new Date(Math.min(...bt.map((b) => b.t))).toISOString()} to ${new Date(Math.max(...bt.map((b) => b.t))).toISOString()})` : ''));
console.log(`SNAP    live snapshot ${new Date(out.latest.takenAt).toISOString()} for ${Object.keys(out.latest.traders).length} traders`);
