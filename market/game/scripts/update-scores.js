// Scoring job: node scripts/update-scores.js [--watch 10]   (minutes between runs)
// Finalizes last week if it ended, makes sure this week exists, pulls live numbers, re-scores, prints the top 10.
import { loadPool, updateLeague } from '../lib/store.js';
import { ensureWeek, snapshot, leaderboard } from '../lib/league.js';
import { weekOf } from '../lib/week.js';

const i = process.argv.indexOf('--watch');
const every = i > -1 ? Number(process.argv[i + 1] || 10) : 0;
async function run() {
  const pool = loadPool();
  if (!pool) throw new Error('No pool yet: run `node scripts/build-pool.js` first.');
  const t0 = Date.now();
  const week = await updateLeague(async (league) => {
    for (const w of Object.values(league.weeks)) if (!w.final && Date.now() >= w.end) await snapshot(w); // freezes at week end
    const w = await ensureWeek(league, pool);
    await snapshot(w);
    return w;
  });
  console.log(`SCORE   ${week.key} at ${new Date(week.latest.takenAt).toISOString()} (${Math.round((Date.now() - t0) / 1000)}s), ${week.entries.length} teams`);
  for (const r of leaderboard(week).slice(0, 10)) console.log(`  #${r.rank} ${r.player.padEnd(16)} ${(r.score >= 0 ? '+' : '') + r.score.toFixed(2)}%  $${r.pnl.toLocaleString('en-US')}`);
}
await run();
if (every) setInterval(() => run().catch((e) => console.error('update failed:', e.message)), every * 60000);
if (weekOf().key !== loadPool()?.week) console.warn('NOTE    pool.json is from another week; run build-pool.js to refresh it.');
