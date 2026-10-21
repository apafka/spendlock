// Builds this week's draft pool: node scripts/build-pool.js [--candidates 100] [--size 50]
// 1) agents/feed-hl.js pulls candidates from the public Hyperliquid leaderboard (reused as-is).
// 2) agents/walletRules.js re-checks each one against the official info API (reused as-is):
//    >= 10 trades and >= $50k account value in the last 30 days, not at the 10k-fill history cap.
// 3) The "portfolio" endpoint gives 30-day PnL / return; salaries come from those.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyWallets } from '../../agents/walletRules.js';
import { getPortfolio } from '../lib/hl.js';
import { assignSalaries } from '../lib/salary.js';
import { save, DATA_DIR } from '../lib/store.js';
import { weekOf } from '../lib/week.js';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const here = path.dirname(fileURLToPath(import.meta.url));
const agentsDir = path.resolve(here, '..', '..', 'agents');
const nCand = Number(arg('candidates', 100)), size = Number(arg('size', 50));
const csv = path.join(DATA_DIR, 'candidates.csv');
fs.mkdirSync(DATA_DIR, { recursive: true });

execFileSync('node', ['feed-hl.js', '--n', String(nCand), '--out', csv], { cwd: agentsDir, stdio: 'inherit' });
const rows = fs.readFileSync(csv, 'utf8').trim().split('\n').slice(1).map((l) => {
  const [address, label] = l.match(/("([^"]|"")*"|[^,]*)/g).filter((_, i) => i % 2 === 0);
  return { address, label: label.replace(/^"|"$/g, '').replace(/""/g, '"') };
});

const spec = { maxItems: 1e9, rules: { windowDays: 30, minTrades: 10, minAccountValueUsd: 50000, minRealizedPnlUsd: -1e15 } };
const t0 = Date.now();
// One at a time (Hyperliquid rate-limits per IP). Wallets the API didn't answer for get one retry after a pause.
let items = (await verifyWallets(rows, spec)).items;
const unreachable = (i) => i.status === 'review' && i.checks.some((c) => c.rule === 'api');
const retry = items.filter(unreachable);
if (retry.length) {
  console.log(`CHECK   ${retry.length} wallets got no API answer; retrying in 60s`);
  await new Promise((r) => setTimeout(r, 60000));
  const again = (await verifyWallets(retry.map((i) => rows.find((r) => r.address.toLowerCase() === i.address)), spec)).items;
  items = items.map((i) => again.find((a) => a.address === i.address) || i);
}
fs.writeFileSync(path.join(DATA_DIR, 'pool-check-report.json'), JSON.stringify(items, null, 2));
// For the game, a wallet at the 10k-fill history cap is fine: scoring uses the portfolio endpoint, not fills.
// It is kept and flagged "very active" (its 30-day trade count and realized PnL are lower bounds).
const capped = (i) => i.status === 'review' && i.checks.some((c) => c.rule === 'history_cap') && !i.checks.some((c) => c.ok === false && c.rule !== 'min_pnl');
const num = (s, re) => { const m = String(s || '').match(re); return m ? Number(m[1].replace(/,/g, '')) : null; };
const passed = items.filter((i) => i.status === 'pass' || capped(i)).map((i) => ({
  address: i.address, veryActive: capped(i) || undefined,
  label: rows.find((r) => r.address.toLowerCase() === i.address)?.label || '',
  trades30d: num(i.checks.find((c) => c.rule === 'min_trades')?.detail, /^(\d+)/),
  realizedPnl30d: num(i.checks.find((c) => c.rule === 'min_pnl')?.detail, /\$(-?[\d,]+)/),
}));
console.log(`CHECK   ${items.length} candidates -> ${passed.length} usable (${passed.filter((p) => p.veryActive).length} at the 10k-fill cap), ${items.filter((i) => i.status === 'review').length} review, ${items.filter((i) => i.status === 'fail').length} fail (${Math.round((Date.now() - t0) / 1000)}s)`);

const traders = [];
for (const t of passed) {
  const p = await getPortfolio(t.address);
  if (!p || p.now.av < 50000) continue;
  traders.push({ ...t, accountValue: Math.round(p.now.av), monthPnl: Math.round(p.month.pnl), monthRoi: +p.month.roi.toFixed(4),
    weekPnlPrior: Math.round(p.week.pnl), volume30d: Math.round(p.volumeMonth) });
}
// Keep a spread, not just the richest: rank by 30-day return and take every k-th so cheap and expensive picks both exist.
traders.sort((a, b) => b.monthRoi - a.monthRoi);
const step = Math.max(1, traders.length / size);
const chosen = traders.length <= size ? traders : Array.from({ length: size }, (_, i) => traders[Math.floor(i * step)]);
const pool = assignSalaries(chosen).map((t, i) => ({ ...t, nick: t.label || `Trader ${t.address.slice(2, 6).toUpperCase()}` }));
const wk = weekOf();
save('pool.json', { week: wk.key, builtAt: new Date().toISOString(), source: 'stats-data.hyperliquid.xyz leaderboard -> agents/walletRules.js -> info API portfolio',
  rules: { windowDays: 30, minTrades: 10, minAccountValueUsd: 50000 }, traders: pool });
console.log(`POOL    ${pool.length} traders for ${wk.key} -> ${path.join(DATA_DIR, 'pool.json')} (salaries ${Math.min(...pool.map((t) => t.salary))}-${Math.max(...pool.map((t) => t.salary))})`);
