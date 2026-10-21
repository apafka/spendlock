// DEMO ONLY: adds fake players with random teams under the cap, scored from the week-start baseline.
// They are marked sim:true and labelled "sim" everywhere. node scripts/simulate-players.js [--n 8]
import { loadPool, updateLeague } from '../lib/store.js';
import { ensureWeek, addEntry } from '../lib/league.js';
import { CAP, TEAM_SIZE } from '../lib/salary.js';

const i = process.argv.indexOf('--n');
const n = i > -1 ? Number(process.argv[i + 1]) : 8;
const NAMES = ['degen_dana', 'perp_pete', 'funding_fiona', 'liq_larry', 'basis_bea', 'hype_hank', 'scalp_sam', 'whale_watcher', 'vault_vic', 'delta_dee', 'gm_gus', 'ape_ari'];
let seed = 42; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pool = loadPool();
function randomTeam() {
  for (;;) {
    const picks = [...pool.traders].sort(() => rnd() - 0.5).slice(0, TEAM_SIZE);
    if (picks.reduce((s, t) => s + t.salary, 0) <= CAP) return picks.map((t) => t.address);
  }
}
await updateLeague(async (league) => {
  const w = await ensureWeek(league, pool);
  for (const name of NAMES.slice(0, n)) {
    const r = await addEntry(league, pool, w, { player: name, picks: randomTeam() }, { sim: true });
    console.log(r.ok ? `SIM     ${name} drafted ${r.entry.picks.length} traders, salary ${r.entry.salary}/${CAP}` : `SIM     ${name}: ${r.error}`);
  }
});
