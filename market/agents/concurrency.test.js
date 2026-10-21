// Two buys at the same time must not race: each gets its own on-chain job id, its own files,
// its own rules, and both settle correctly. Offline (private anvil + fake Hyperliquid). Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hasAnvil, setup, WALLETS } from './e2e-harness.js';

test('two concurrent buys get separate jobs and both settle', { skip: !hasAnvil() && 'anvil not installed', timeout: 180000 }, async () => {
  const env = await setup();
  try {
    const { buyVerifiedWallets } = await import('./buy.js');
    const { readJson, jobFile, jobsDir } = await import('./lib.js');
    const { publicClient, artifact, loadDeployment, account, fromUnits } = await import('./config.js');

    const [a, b] = await Promise.all([
      buyVerifiedWallets({ count: 3, note: 'buyer A' }),
      buyVerifiedWallets({ count: 2, overrides: { minTrades: 50 }, note: 'buyer B' }),
    ]);
    assert.notEqual(a.jobId, b.jobId);
    assert.deepEqual([a.jobId, b.jobId].sort(), [1, 2]);
    // Each buyer got ITS job: own spec (count + rules), own result, own report.
    const specA = readJson(jobFile(a.jobId, 'spec')), specB = readJson(jobFile(b.jobId, 'spec'));
    assert.equal(specA.note, 'buyer A'); assert.equal(specA.maxItems, 3); assert.equal(specA.rules.minTrades, 20);
    assert.equal(specB.note, 'buyer B'); assert.equal(specB.maxItems, 2); assert.equal(specB.rules.minTrades, 50);
    assert.equal(readJson(jobFile(a.jobId, 'report')).jobId, a.jobId);
    assert.equal(readJson(jobFile(b.jobId, 'result')).jobId, b.jobId);
    assert.equal(a.verified, 3); assert.equal(a.paidUSDC, 9);
    assert.equal(b.verified, 2); assert.equal(b.paidUSDC, 6);
    const active = new Set(WALLETS.filter((w) => w.fills >= 50).map((w) => w.address));
    for (const w of b.wallets) assert.ok(active.has(w.address), `B got ${w.address}, which has < 50 trades`);
    assert.ok(!fs.existsSync(jobFile('latest', 'id')), 'no shared latest file');
    assert.ok(!fs.existsSync(`${jobsDir}/.locks`) || fs.readdirSync(`${jobsDir}/.locks`).length === 0, 'locks released');

    // On-chain: both settled, money adds up, escrow empty.
    const dep = loadDeployment();
    for (const id of [a.jobId, b.jobId]) {
      const job = await publicClient.readContract({ address: dep.escrow, abi: artifact('ResultEscrow').abi, functionName: 'jobs', args: [BigInt(id)] });
      assert.equal(job[6], 3, `job #${id} settled`);
    }
    const bal = async (who) => fromUnits(await publicClient.readContract({ address: dep.usdc, abi: artifact('MockUSDC').abi, functionName: 'balanceOf', args: [who] }));
    assert.equal(await bal(dep.escrow), '0.00');
    assert.equal(await bal(account('WORKER').address), '14.70'); // 5 x $3 minus 2% fee
    assert.equal(await bal(dep.feeRecipient), '0.30');
    assert.equal(await bal(account('CLIENT').address), '1985.00'); // minted 2 x 1000, spent 15
  } finally { env.teardown(); }
});
