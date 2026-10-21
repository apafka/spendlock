// Run: node --test   (offline: fake Hyperliquid API)
import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyWallets } from './walletRules.js';

const A = '0x' + 'a'.repeat(40), B = '0x' + 'b'.repeat(40), C = '0x' + 'c'.repeat(40), D = '0x' + 'd'.repeat(40);
const fill = (pnl) => ({ closedPnl: String(pnl), fee: '1' });
const db = {
  [A]: { av: 80000, fills: Array.from({ length: 25 }, () => fill(600)) },   // 25 trades, ~$14,975
  [B]: { av: 80000, fills: Array.from({ length: 25 }, () => fill(-100)) },  // losing
  [C]: { av: 1000, fills: Array.from({ length: 30 }, () => fill(1000)) },   // too small account
};
const info = async ({ type, user }) => {
  if (user === D) return null; // API down for this one
  const w = db[user] || { av: 0, fills: [] };
  if (type === 'spotClearinghouseState') return { balances: [{ coin: 'USDC', total: String(w.spot || 0) }] };
  return type === 'clearinghouseState' ? { marginSummary: { accountValue: String(w.av) } } : w.fills;
};
const spec = { maxItems: 10, rules: { windowDays: 30, minRealizedPnlUsd: 10000, minTrades: 20, minAccountValueUsd: 50000 } };

test('checks every wallet against the API; unreachable = review', async () => {
  const r = await verifyWallets([
    { address: A.toUpperCase().replace('0X', '0x') }, { address: B }, { address: C }, { address: D },
    { address: A }, { address: 'nope' },
  ], spec, { info });
  assert.deepEqual(r.items.map((i) => i.status), ['pass', 'fail', 'fail', 'review', 'fail', 'fail']);
  assert.match(r.items[1].reason, /realized PnL/);
  assert.match(r.items[2].reason, /account value/);
  assert.equal(r.items[4].reason, 'duplicate address');
  assert.equal(r.verified.length, 1);
});

test('worker claims must match reality', async () => {
  const r = await verifyWallets([{ address: A, claimed_pnl_usd: 15000, claimed_trades: 25 }, { address: A.replace('a', 'a') }], spec, { info });
  assert.equal(r.items[0].status, 'pass');
  const r2 = await verifyWallets([{ address: A, claimed_pnl_usd: 50000 }], spec, { info });
  assert.equal(r2.items[0].status, 'fail');
  assert.match(r2.items[0].reason, /claimed \$50000/);
});

test('exclude list and maxItems', async () => {
  const r = await verifyWallets([{ address: A }], { ...spec, rules: { ...spec.rules, excludeAddresses: [A] } }, { info });
  assert.equal(r.items[0].reason, 'address on exclude list');
  db[C].av = 90000;
  const r2 = await verifyWallets([{ address: A }, { address: C }], { ...spec, maxItems: 1 }, { info });
  assert.equal(r2.items[1].reason, 'over maxItems (not paid)');
});

test('unified account: collateral in spot USDC counts as account value', async () => {
  const E = '0x' + 'e'.repeat(40);
  db[E] = { av: 0, spot: 4000000, fills: Array.from({ length: 25 }, () => fill(600)) };
  const r = await verifyWallets([{ address: E }], spec, { info });
  assert.equal(r.items[0].status, 'pass');
});

test('wallet at the 10,000-fill history cap is review, not pass', async () => {
  const F = '0x' + 'f'.repeat(40);
  db[F] = { av: 90000, fills: Array.from({ length: 10000 }, (_, i) => ({ closedPnl: '5', fee: '0', time: i })) };
  const paged = async (q) => (q.type === 'userFillsByTime' && q.user === F ? db[F].fills.filter((f) => f.time >= q.startTime).slice(0, 2000) : info(q));
  const r = await verifyWallets([{ address: F }], spec, { info: paged, now: 20000 });
  assert.equal(r.items[0].status, 'review');
  assert.match(r.items[0].reason, /history cap/);
  assert.equal(r.verified.length, 0);
});
