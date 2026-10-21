// Spendlock end to end, offline (private anvil + fake Hyperliquid): an agent uses its MCP tools to read its
// allowance, gets rejected for a non-allowlisted recipient, buys wallets through ResultEscrow from the vault,
// and the escrow refund for unverified wallets lands back in the vault. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { hasAnvil, setup } from './e2e-harness.js';

test('spendlock: MCP status/spend, escrow buy from the vault, refund returns to the vault', { skip: !hasAnvil() && 'anvil not installed', timeout: 180000 }, async () => {
  const env = await setup();
  execFileSync('node', ['deploy-spendlock.js'], { cwd: import.meta.dirname, env: process.env, stdio: 'ignore' });
  const { account } = await import('./config.js');
  const sl = await import('./spendlock.js');
  const mcp = new Client({ name: 't', version: '0' });
  try {
    const A = account('AGENT_A').address;
    await sl.fund(100, { mint: true });
    await sl.setPolicy(A, { perTxUSDC: 40, dailyUSDC: 50, budgetUSDC: 60, approvalAboveUSDC: 0 });
    await sl.ownerTx('setAllowed', [A, sl.vault().dep.escrow, true]);

    await mcp.connect(new StdioClientTransport({ command: 'node', args: ['spendlock-mcp.js'], env: { ...process.env, SPENDLOCK_AGENT: 'AGENT_A' } }));
    const call = async (name, args = {}) => JSON.parse((await mcp.callTool({ name, arguments: args }, undefined, { timeout: 120000 })).content[0].text);
    assert.deepEqual((await mcp.listTools()).tools.map((t) => t.name).sort(), ['spendlock_spend', 'spendlock_status']);
    let s = await call('spendlock_status');
    assert.equal(s.remaining.spendableNowUSDC, '40.00');
    assert.equal(s.vaultUSDC, '100.00');

    const bad = await call('spendlock_spend', { to: '0x000000000000000000000000000000000000dEaD', amountUSDC: 1, memo: 'x' });
    assert.equal(bad.status, 'rejected'); assert.equal(bad.reason, 'recipient not allowed');

    // 12 wallets ($36) but the fake API only has 10 that pass: 10 paid, $6 refunded to the VAULT.
    const buy = await call('spendlock_spend', { buyWallets: 12, memo: 'test buy' });
    assert.equal(buy.status, 'executed');
    assert.equal(buy.delivery.verified, 10);
    assert.equal(buy.delivery.settlement.refundUSDC, '6.00');
    s = await call('spendlock_status');
    assert.equal(s.vaultUSDC, '70.00');            // 100 - 36 + 6
    assert.equal(s.remaining.todayUSDC, '14.00');  // refunds do not restore the limit
    const over = await call('spendlock_spend', { buyWallets: 5, memo: 'too much today' });
    assert.equal(over.status, 'rejected'); assert.equal(over.reason, 'over daily limit');

    await sl.ownerTx('setKill', [true]);
    s = await call('spendlock_status');
    assert.equal(s.killSwitch, true); assert.equal(s.remaining.spendableNowUSDC, '0.00');
  } finally { await mcp.close(); env.teardown(); }
});
