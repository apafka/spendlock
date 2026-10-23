// Quickstart helpers + (when anvil is on PATH) the anvil e2e.
// Full story is also `node quickstart.js --verify` / `./quickstart.sh --verify`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ANVIL,
  QUICKSTART_AGENT,
  formatMcpSnippet,
  formatStory,
  helpText,
  mcpConfig,
  parseArgs,
} from './quickstart.js';
import { createTeam, needsOwnerApproval, vaultApprovalThresholdUSDC } from './profiles.js';

test('parseArgs understands --verify and rejects unknown flags', () => {
  assert.deepEqual(parseArgs(['--verify']), {
    verify: true, json: false, help: false, port: null, stateDir: null, network: null,
  });
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
});

test('MCP snippet is pasteable Cursor / Claude Desktop JSON', () => {
  const cfg = mcpConfig({
    mcpPath: '/tmp/spendlock/agents/spendlock-mcp.js',
    env: {
      SPENDLOCK_MODE: 'vault',
      NETWORK: 'local',
      SPENDLOCK_RPC: 'http://127.0.0.1:8545',
      SPENDLOCK_VAULT: '0x1111111111111111111111111111111111111111',
      SPENDLOCK_AGENT_KEY: ANVIL.agent.key,
      SPENDLOCK_DATA_DIR: '/tmp/spendlock/.spendlock/data',
    },
    redactKey: false,
  });
  assert.equal(cfg.mcpServers.spendlock.command, 'node');
  assert.equal(cfg.mcpServers.spendlock.args[0], '/tmp/spendlock/agents/spendlock-mcp.js');
  assert.equal(cfg.mcpServers.spendlock.env.SPENDLOCK_MODE, 'vault');
  assert.match(formatMcpSnippet(cfg), /"spendlock_pay"|spendlock-mcp\.js/);
  const redacted = mcpConfig({
    mcpPath: '/tmp/spendlock/agents/spendlock-mcp.js',
    env: { SPENDLOCK_AGENT_KEY: '0xabc' },
    redactKey: true,
  });
  assert.equal(redacted.mcpServers.spendlock.env.SPENDLOCK_AGENT_KEY, '<your SPENDLOCK_AGENT_KEY>');
});

test('default scout profile: $0.02 pays, $0.50 waits, $25 over cap', () => {
  const t = createTeam({
    seed: false,
    mode: 'vault',
    dataDir: mkdtempSync(join(tmpdir(), 'spendlock-qs-')),
  });
  const agent = t.upsert({ ...QUICKSTART_AGENT, address: ANVIL.agent.address });
  assert.equal(agent.id, 'scout');
  assert.equal(needsOwnerApproval(agent, 0.02), false);
  assert.equal(needsOwnerApproval(agent, 0.5), true);
  assert.equal(t.check('scout', 25, 'http://127.0.0.1:4023/v1/dataset'), 'over per-tx cap');
  assert.equal(t.check('scout', 0.02, 'http://127.0.0.1:4021/v1/price'), '');
  assert.equal(vaultApprovalThresholdUSDC(agent.approvalRule), 0.1);
});

test('help text names the one command and Base Sepolia env vars', () => {
  const text = helpText();
  assert.match(text, /quickstart\.sh/);
  assert.match(text, /base-sepolia/);
  assert.match(text, /OWNER_PRIVATE_KEY/);
  assert.match(text, /refuses mainnet/i);
});

test('formatStory prints the three required outcomes', () => {
  const text = formatStory({
    paid: { outcome: 'paid', amountUSDC: 0.02 },
    blocked: { outcome: 'blocked', amountUSDC: 25, reason: 'over per-tx cap' },
    pending: { outcome: 'pending', amountUSDC: 0.5, reason: 'asks owner above $0.1', requestId: 1 },
    approved: { outcome: 'paid', amountUSDC: 0.5 },
    ok: true,
  });
  assert.match(text, /paid/);
  assert.match(text, /blocked/);
  assert.match(text, /pending/);
  assert.match(text, /OK paid \/ blocked \/ waiting-for-approval/);
});
