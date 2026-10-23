#!/usr/bin/env node
// Spendlock MCP server for a team of agent profiles.
// Tools: spendlock_status, spendlock_spend, spendlock_pay
// Caps, allowlist, approval, and the kill switch are enforced before money moves.
// Simulated (default) or local anvil / MockUSDC. Refuses mainnet.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import { defaultTeam, remainingOf, approvalRuleLabel } from './profiles.js';
import { spendlockPay } from './pay.js';

const MODE = process.env.SPENDLOCK_MODE || (process.env.SPENDLOCK_VAULT ? 'vault' : 'simulated');
const team = defaultTeam({ mode: MODE, seed: true });

function vaultHelpers() {
  return import('./lib.js');
}

function agentAccount() {
  const raw = process.env.SPENDLOCK_AGENT_KEY;
  if (!raw) return null;
  return vaultHelpers().then((lib) => lib.keyToAccount(raw));
}

const reply = (o, isError = false) => ({
  isError,
  content: [{ type: 'text', text: JSON.stringify(o, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2) }],
});
const safe = (fn) => async (args) => {
  try {
    return reply(await fn(args ?? {}));
  } catch (e) {
    return reply({ error: e.shortMessage || e.message }, true);
  }
};

function profileView(agent) {
  if (!agent) return null;
  const left = remainingOf(agent, team.vaultUSDC(), team.killed());
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    active: agent.active,
    paused: agent.paused,
    perTxUSDC: agent.perTxUSDC,
    dailyUSDC: agent.dailyUSDC,
    budgetUSDC: agent.budgetUSDC,
    approvalRule: agent.approvalRule,
    approval: approvalRuleLabel(agent.approvalRule),
    allowlist: agent.allowlist,
    blocklist: agent.blocklist,
    spentTodayUSDC: left.spentTodayUSDC,
    spentTotalUSDC: agent.spentTotalUSDC,
    remaining: left,
    history: team.historyFor(agent.id),
  };
}

export function createSpendlockServer() {
  const server = new McpServer({ name: 'spendlock', version: '0.3.0' });

  server.tool(
    'spendlock_status',
    'Team vault + agent profiles: remaining per tx / today / budget, approval rule, pause, kill switch, pending requests, and per-agent purchase history.',
    {
      agent: z.string().optional().describe('Optional profile id or name to focus on.'),
    },
    safe(async ({ agent: agentId } = {}) => {
      const focus = agentId ? team.findAgent(agentId) : null;
      const base = {
        mode: MODE,
        killed: team.killed(),
        vaultUSDC: team.vaultUSDC(),
        pending: team.pending(),
        log: team.log(),
        agents: team.agents().map(profileView),
      };
      if (focus) return { ...base, agent: profileView(focus) };
      if (MODE === 'vault' && process.env.SPENDLOCK_AGENT_KEY) {
        const lib = await vaultHelpers();
        const account = lib.keyToAccount(process.env.SPENDLOCK_AGENT_KEY);
        const { publicClient } = await lib.clients();
        const onchain = await lib.status(publicClient, account.address);
        return { ...base, onchain };
      }
      return base;
    }),
  );

  server.tool(
    'spendlock_spend',
    'Spend USDC from the owner vault (on-chain, local anvil / testnet). `to` must be on your allowlist. Returns executed, pending, or rejected. Prefer spendlock_pay for x402 sellers.',
    {
      to: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Recipient address (must be allowlisted).'),
      amountUSDC: z.number().positive().max(1_000_000).describe('Amount in USDC (play money / testnet).'),
      memo: z.string().max(200).default('').describe('Why you are spending (stored in the event).'),
    },
    safe(async ({ to, amountUSDC, memo }) => {
      if (MODE === 'simulated') {
        throw new Error('spendlock_spend needs vault mode (local anvil). Use spendlock_pay for x402 sellers.');
      }
      const lib = await vaultHelpers();
      const account = await agentAccount();
      if (!account) throw new Error('SPENDLOCK_AGENT_KEY required for spendlock_spend.');
      const { publicClient, walletClient } = await lib.clients(account);
      if (!walletClient) throw new Error('Wallet client missing.');
      const amount = lib.usdc(amountUSDC);
      const preview = await lib.read(publicClient, 'check', [account.address, to, amount]);
      const hash = await walletClient.writeContract({
        address: lib.vaultAddress(),
        abi: lib.abi,
        functionName: 'spend',
        args: [to, amount, memo || ''],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const onchain = lib.decodeSpendReceipt(receipt, lib.abi);
      if (onchain.outcome === 'unknown' && preview) {
        return { outcome: 'rejected', reason: preview, tx: hash, to, amountUSDC, memo: memo || '' };
      }
      return { ...onchain, tx: hash, to, amountUSDC, memo: memo || '' };
    }),
  );

  server.tool(
    'spendlock_pay',
    'Pay an x402 seller from the team vault under an agent profile. Makes the request; on HTTP 402, checks seller allowlist/blocklist, per-tx cap, daily and lifetime budget, approval rule, and kill switch BEFORE paying. If allowed, pays and retries with the payment proof. Logs paid, blocked, or waiting for owner approval.',
    {
      agent: z.string().min(1).describe('Agent profile id or name.'),
      url: z.string().url().describe('Seller URL. If the seller replies 402 Payment Required, Spendlock pays under the profile rules.'),
      method: z.enum(['GET', 'POST']).optional().describe('HTTP method. Default GET.'),
      body: z.union([z.string(), z.record(z.unknown())]).optional().describe('Optional JSON body for POST.'),
    },
    safe(async ({ agent, url, method, body }) => spendlockPay(team, { agent, url, method: method || 'GET', body })),
  );

  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const server = createSpendlockServer();
  await server.connect(new StdioServerTransport());
}
