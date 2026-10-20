#!/usr/bin/env node
// Spendlock MCP server for ONE agent.
// Tools: spendlock_status, spendlock_spend
// The contract — not this process — enforces caps, allowlist, approval, and the kill switch.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { decodeEventLog } from 'viem';
import { z } from 'zod';
import { abi, clients, keyToAccount, read, status, usdc, vaultAddress } from './lib.js';

const account = keyToAccount(process.env.SPENDLOCK_AGENT_KEY);
const server = new McpServer({ name: 'spendlock', version: '0.2.0' });
const reply = (o, isError = false) => ({
  isError,
  content: [{ type: 'text', text: JSON.stringify(o, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2) }],
});
const safe = (fn) => async (args) => {
  try {
    return reply(await fn(args));
  } catch (e) {
    return reply({ error: e.shortMessage || e.message }, true);
  }
};

server.tool(
  'spendlock_status',
  'Your remaining allowance (per tx, today, total budget), your rules, and whether the kill switch is on.',
  {},
  safe(async () => {
    const { publicClient } = await clients();
    const s = await status(publicClient, account.address);
    const n = Number(await read(publicClient, 'requestCount'));
    const pending = [];
    for (let i = 1; i <= n; i++) {
      const r = await read(publicClient, 'getRequest', [BigInt(i)]);
      if (Number(r.status) === 1 && r.agent.toLowerCase() === account.address.toLowerCase()) {
        pending.push({ id: i, to: r.to, amountUSDC: Number(r.amount) / 1e6, memo: r.memo });
      }
    }
    return { ...s, pending };
  }),
);

server.tool(
  'spendlock_spend',
  'Spend USDC from the owner vault. `to` must be on your allowlist. Returns executed, pending (owner must approve), or rejected with a reason from the contract.',
  {
    to: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Recipient address (must be allowlisted).'),
    amountUSDC: z.number().positive().max(1_000_000).describe('Amount in USDC (play money / testnet).'),
    memo: z.string().max(200).default('').describe('Why you are spending (stored in the event).'),
  },
  safe(async ({ to, amountUSDC, memo }) => {
    const { publicClient, walletClient } = await clients(account);
    if (!walletClient) throw new Error('Wallet client missing.');
    const amount = usdc(amountUSDC);
    const preview = await read(publicClient, 'check', [account.address, to, amount]);
    const hash = await walletClient.writeContract({
      address: vaultAddress(),
      abi,
      functionName: 'spend',
      args: [to, amount, memo || ''],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return { ...decodeOutcome(receipt, preview), tx: hash, to, amountUSDC, memo: memo || '' };
  }),
);

function decodeOutcome(receipt, preview) {
  for (const log of receipt.logs) {
    try {
      const parsed = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (parsed.eventName === 'Spent') {
        return { outcome: 'executed', requestId: Number(parsed.args.requestId) };
      }
      if (parsed.eventName === 'SpendRequested') {
        return { outcome: 'pending', requestId: Number(parsed.args.requestId) };
      }
      if (parsed.eventName === 'SpendRejected') {
        return { outcome: 'rejected', requestId: Number(parsed.args.requestId), reason: parsed.args.reason };
      }
    } catch {
      // logs from other contracts
    }
  }
  if (preview) return { outcome: 'rejected', reason: preview };
  return { outcome: 'unknown' };
}

await server.connect(new StdioServerTransport());
