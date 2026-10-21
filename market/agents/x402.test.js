// x402 endpoint: unpaid -> 402 with price; paid -> verified report; replays and bad payments refused.
// Offline (private anvil + fake Hyperliquid). Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasAnvil, setup } from './e2e-harness.js';

test('x402: 402 quote, escrow payment, verified report, no replay', { skip: !hasAnvil() && 'anvil not installed', timeout: 180000 }, async () => {
  const env = await setup();
  const { createX402Server } = await import('./x402-server.js');
  const { payAndBuy, request } = await import('./x402-agent-client.js');
  const { publicClient, artifact, loadDeployment, account, fromUnits } = await import('./config.js');
  const server = createX402Server();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/v1/hl-wallets`;
  const dep = loadDeployment();
  const bal = async (who) => fromUnits(await publicClient.readContract({ address: dep.usdc, abi: artifact('MockUSDC').abi, functionName: 'balanceOf', args: [who] }));
  try {
    // 1) unpaid
    const unpaid = await request(new URL(`${url}?count=2&minTrades=50`));
    assert.equal(unpaid.status, 402);
    assert.equal(unpaid.body.x402Version, 1);
    const req = unpaid.body.accepts[0];
    assert.equal(req.scheme, 'escrow');
    assert.equal(req.maxAmountRequired, '6000000'); // 2 x $3, 6 decimals
    assert.equal(req.payTo.toLowerCase(), dep.escrow.toLowerCase());
    assert.equal(JSON.parse(req.extra.spec).rules.minTrades, 50);
    assert.equal((await request(new URL(`${url}?count=99`))).status, 400);
    assert.equal((await request(new URL(`${url}?count=2`), { headers: { 'X-PAYMENT': 'garbage' } })).status, 402);

    // 2) paid
    const r = await payAndBuy({ url, count: 2, rules: { minTrades: 50 }, log: () => {} });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.verified, 2);
    assert.equal(r.body.jobId, r.jobId);
    assert.equal(r.body.payer, account('BUYER').address);
    assert.equal(r.receipt.success, true);
    assert.match(r.receipt.transaction, /^0x[0-9a-f]{64}$/);
    assert.equal(r.receipt.refundUSDC, 0);
    assert.equal(await bal(account('BUYER').address), '94.00'); // minted 100, paid 2 x $3
    assert.equal(await bal(dep.escrow), '0.00');

    // 3) replay of the same payment -> refused, nothing runs twice
    const replay = await request(new URL(`${url}?count=2`), { headers: { 'X-PAYMENT': r.payment } });
    assert.equal(replay.status, 402);
    assert.match(replay.body.error, /already redeemed/);

    // 4) escrow job that does not commit to the quoted spec -> refused (USDC stays refundable in escrow)
    const bad = await payAndBuy({ url, count: 1, log: () => {}, tamper: 'specHash' });
    assert.equal(bad.status, 402);
    assert.match(bad.body.error, /specHash does not match/);
  } finally { server.close(); env.teardown(); }
});
