// CANDIDATE FEED for the wallet niche: node feed-hl.js [--out data/hl-candidates.csv] [--n 40]
// Source: Hyperliquid's public leaderboard file (the one app.hyperliquid.xyz/leaderboard uses).
// It is not a documented API and is ~40 MB, so treat it as a hint list only: the checker re-verifies
// every wallet against the documented info API. Pre-filter loosely so we don't submit obvious misses.
import fs from 'node:fs';
import { arg } from './lib.js';

const URL = process.env.HL_LEADERBOARD_URL || 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard'; // override = offline tests
const n = Number(arg('n', 40));
const res = await fetch(URL, { signal: AbortSignal.timeout(60000) });
if (!res.ok) throw new Error(`leaderboard HTTP ${res.status}`);
const rows = (await res.json()).leaderboardRows;
const month = (r) => Object.fromEntries(r.windowPerformances)['month'] || {};
const picked = rows
  .filter((r) => Number(r.accountValue) >= 50000 && Number(r.accountValue) <= 10e6 && Number(month(r).pnl) >= 10000)
  .sort((a, b) => Number(month(b).pnl) - Number(month(a).pnl))
  .slice(0, n);
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const lines = ['address,label,leaderboard_month_pnl,account_value',
  ...picked.map((r) => [r.ethAddress, esc(r.displayName || ''), Math.round(month(r).pnl), Math.round(r.accountValue)].join(','))];
const out = arg('out', 'data/hl-candidates.csv');
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(`FEED    ${rows.length} leaderboard rows -> ${picked.length} candidates (month PnL >= $10k, account $50k–$10M, skips market makers and vaults) -> ${out}`);
