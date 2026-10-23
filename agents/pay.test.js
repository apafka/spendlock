// Agent profiles + spendlock_pay against three local mock x402 sellers.
// Simulated play money. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createTeam, remainingOf, vaultApprovalThresholdUSDC } from './profiles.js';
import { startMockSellers } from './mock-sellers.js';
import { approvePay, rejectPay, spendlockPay } from './pay.js';
import { runDemo } from './demo-x402.js';

function team() {
  return createTeam({ seed: true, mode: 'simulated', dataDir: mkdtempSync(join(tmpdir(), 'spendlock-')) });
}

test('vault approval mapping: every purchase vs $50/$100/$200 auto-approve', () => {
  assert.equal(vaultApprovalThresholdUSDC('every'), 1 / 1e6);
  assert.equal(vaultApprovalThresholdUSDC(50), 50);
  assert.equal(vaultApprovalThresholdUSDC(100), 100);
  assert.equal(vaultApprovalThresholdUSDC(200), 200);
  assert.equal(vaultApprovalThresholdUSDC(0.1), 0.1);
});

test('custom $0.10 approval: price feed pays, company data waits, dataset blocked', async () => {
  const t = createTeam({ seed: false, mode: 'simulated', dataDir: mkdtempSync(join(tmpdir(), 'spendlock-')) });
  t.upsert({
    id: 'scout',
    name: 'Scout',
    perTxUSDC: 5,
    dailyUSDC: 50,
    budgetUSDC: 100,
    approvalRule: 0.1,
  });
  const pack = await startMockSellers();
  try {
    const paid = await spendlockPay(t, { agent: 'scout', url: pack.byId['price-feed'].url });
    const pending = await spendlockPay(t, { agent: 'scout', url: pack.byId['company-data'].url });
    const blocked = await spendlockPay(t, { agent: 'scout', url: pack.byId.dataset.url });
    assert.equal(paid.outcome, 'paid');
    assert.equal(pending.outcome, 'pending');
    assert.equal(blocked.outcome, 'blocked');
    assert.equal(blocked.reason, 'over per-tx cap');
  } finally {
    await pack.close();
  }
});

test('one agent, three sellers, one budget: first two paid, $25 blocked by per-tx cap', async () => {
  const t = team();
  const pack = await startMockSellers();
  try {
    const r1 = await spendlockPay(t, { agent: 'scout', url: pack.byId['price-feed'].url, memo: 'tick' });
    const r2 = await spendlockPay(t, { agent: 'scout', url: pack.byId['company-data'].url, memo: 'co' });
    const r3 = await spendlockPay(t, { agent: 'scout', url: pack.byId['dataset'].url, memo: 'data' });
    assert.equal(r1.outcome, 'paid');
    assert.equal(r1.data.seller, 'price-feed');
    assert.equal(r2.outcome, 'paid');
    assert.equal(r2.data.seller, 'company-data');
    assert.equal(r3.outcome, 'blocked');
    assert.equal(r3.reason, 'over per-tx cap');

    const scout = t.findAgent('scout');
    assert.equal(scout.spentTotalUSDC, 0.52);
    const left = remainingOf(scout, t.vaultUSDC(), t.killed());
    assert.equal(left.spentTodayUSDC, 0.52);
    assert.equal(left.todayUSDC, 49.48);

    const log = t.log();
    assert.equal(log.length, 3);
    assert.deepEqual(log.map((e) => e.outcome), ['blocked', 'paid', 'paid']);
    assert.ok(log.every((e) => e.agentId === 'scout'));
  } finally {
    await pack.close();
  }
});

test('second agent: approval required for every purchase, owner approve/reject', async () => {
  const t = team();
  const pack = await startMockSellers();
  try {
    const pending = await spendlockPay(t, { agent: 'ops', url: pack.byId['company-data'].url });
    assert.equal(pending.outcome, 'pending');
    assert.equal(pending.reason, 'approval required for every purchase');
    assert.equal(t.pending().length, 1);
    assert.equal(t.log()[0].outcome, 'waiting');

    const paid = await approvePay(t, pending.requestId);
    assert.equal(paid.outcome, 'paid');
    assert.equal(paid.data.seller, 'company-data');
    assert.equal(t.findAgent('ops').spentTotalUSDC, 0.5);
    assert.equal(t.pending().length, 0);

    const again = await spendlockPay(t, { agent: 'ops', url: pack.byId['price-feed'].url });
    assert.equal(again.outcome, 'pending');
    const rejected = rejectPay(t, again.requestId, 'rejected by owner');
    assert.equal(rejected.outcome, 'blocked');
    assert.equal(t.findAgent('ops').spentTotalUSDC, 0.5);
    assert.equal(t.log()[0].reason, 'rejected by owner');
  } finally {
    await pack.close();
  }
});

test('kill switch freezes both agents; pause and delete are per-profile off switches', async () => {
  const t = team();
  const pack = await startMockSellers();
  try {
    t.setKill(true);
    const a = await spendlockPay(t, { agent: 'scout', url: pack.byId['price-feed'].url });
    const b = await spendlockPay(t, { agent: 'ops', url: pack.byId['price-feed'].url });
    assert.equal(a.outcome, 'blocked');
    assert.equal(a.reason, 'kill switch on');
    assert.equal(b.outcome, 'blocked');
    assert.equal(b.reason, 'kill switch on');

    t.setKill(false);
    t.pause('scout', true);
    const paused = await spendlockPay(t, { agent: 'scout', url: pack.byId['price-feed'].url });
    assert.equal(paused.reason, 'agent paused');
    t.pause('scout', false);

    t.remove('ops');
    const gone = await spendlockPay(t, { agent: 'ops', url: pack.byId['price-feed'].url });
    assert.equal(gone.reason, 'agent removed');
  } finally {
    await pack.close();
  }
});

test('seller blocklist and allowlist are checked before paying', async () => {
  const t = team();
  const pack = await startMockSellers();
  try {
    t.upsert({ id: 'scout', blocklist: [pack.byId['company-data'].origin] });
    const blocked = await spendlockPay(t, { agent: 'scout', url: pack.byId['company-data'].url });
    assert.equal(blocked.outcome, 'blocked');
    assert.equal(blocked.reason, 'seller blocked');

    t.upsert({ id: 'scout', blocklist: [], allowlist: [pack.byId['price-feed'].url] });
    const denied = await spendlockPay(t, { agent: 'scout', url: pack.byId['dataset'].url });
    assert.equal(denied.reason, 'seller not allowed');
    const ok = await spendlockPay(t, { agent: 'scout', url: pack.byId['price-feed'].url });
    assert.equal(ok.outcome, 'paid');
  } finally {
    await pack.close();
  }
});

test('demo script: paid, paid, blocked, approval, kill', async () => {
  const { results, team: t } = await runDemo({ log: () => {} });
  assert.equal(results.r1.outcome, 'paid');
  assert.equal(results.r2.outcome, 'paid');
  assert.equal(results.r3.outcome, 'blocked');
  assert.equal(results.r3.reason, 'over per-tx cap');
  assert.equal(results.r4.outcome, 'pending');
  assert.equal(results.r5.outcome, 'paid');
  assert.equal(results.r6.reason, 'kill switch on');
  assert.equal(results.r7.reason, 'kill switch on');
  const outcomes = t.log().map((e) => e.outcome);
  assert.ok(outcomes.includes('paid'));
  assert.ok(outcomes.includes('blocked'));
  assert.ok(outcomes.includes('waiting'));
  assert.ok(outcomes.includes('kill'));
});

test('MCP: spendlock_pay, status, and owner approval queue', { timeout: 30000 }, async () => {
  const pack = await startMockSellers();
  const dataDir = mkdtempSync(join(tmpdir(), 'spendlock-mcp-'));
  const mcp = new Client({ name: 't', version: '0' });
  const env = {
    ...process.env,
    SPENDLOCK_MODE: 'simulated',
    SPENDLOCK_DATA_DIR: dataDir,
  };
  try {
    await mcp.connect(new StdioClientTransport({
      command: 'node',
      args: [join(import.meta.dirname, 'spendlock-mcp.js')],
      env,
    }));
    const tools = (await mcp.listTools()).tools.map((t) => t.name).sort();
    assert.deepEqual(tools, ['spendlock_pay', 'spendlock_spend', 'spendlock_status']);
    const call = async (name, args = {}) => JSON.parse((await mcp.callTool({ name, arguments: args })).content[0].text);

    const status = await call('spendlock_status');
    assert.equal(status.killed, false);
    assert.ok(status.agents.some((a) => a.id === 'scout'));

    const paid = await call('spendlock_pay', { agent: 'scout', url: pack.byId['price-feed'].url });
    assert.equal(paid.outcome, 'paid');
    const blocked = await call('spendlock_pay', { agent: 'scout', url: pack.byId['dataset'].url });
    assert.equal(blocked.outcome, 'blocked');
    assert.equal(blocked.reason, 'over per-tx cap');
    const waiting = await call('spendlock_pay', { agent: 'ops', url: pack.byId['company-data'].url });
    assert.equal(waiting.outcome, 'pending');

    const after = await call('spendlock_status', { agent: 'scout' });
    assert.equal(after.agent.spentTodayUSDC, 0.02);
    assert.ok(after.log.length >= 3);
    assert.equal(after.pending.length, 1);
  } finally {
    await mcp.close();
    await pack.close();
  }
});
