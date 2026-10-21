// SPENDLOCK MCP SERVER: tools for ONE agent spending from an owner's Spendlock vault.
// Run: SPENDLOCK_AGENT=AGENT_A node spendlock-mcp.js   (stdio; NETWORK as everywhere else, default local)
// The rules are onchain: this server cannot spend more than the vault allows, whatever the agent asks.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { account } from './config.js';
import { status, spend, buyWallets } from './spendlock.js';

const ROLE = process.env.SPENDLOCK_AGENT || 'AGENT_A';
const me = account(ROLE).address;
const server = new McpServer({ name: 'spendlock', version: '0.1.0' });
const reply = (o, isError = false) => ({ isError, content: [{ type: 'text', text: JSON.stringify(o, null, 2) }] });
const safe = (fn) => async (args) => { try { return reply(await fn(args)); } catch (e) { return reply({ error: e.shortMessage || e.message }, true); } };

server.tool('spendlock_status', 'Your remaining allowance (per tx, today, total budget), your rules, and who you may pay.', {},
  safe(() => status(me)));

server.tool('spendlock_spend',
  'Spend USDC from the vault. Either pay `to` (must be on your allowlist) or set `buyWallets` to buy that many verified Hyperliquid wallets through ResultEscrow. Result: executed, pending (owner must approve) or rejected with a reason.',
  {
    to: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional().describe('Recipient address (plain payment).'),
    amountUSDC: z.number().positive().max(1_000_000).optional().describe('Amount for a plain payment, in USDC.'),
    memo: z.string().max(200).default('').describe('Why you are spending (stored onchain in the event).'),
    buyWallets: z.number().int().min(1).max(30).optional().describe('Instead of a plain payment: buy N verified wallets ($3 each) via escrow; unverified ones are refunded to the vault.'),
  },
  safe(async ({ to, amountUSDC, memo, buyWallets: n }) => {
    if (n) return buyWallets(ROLE, { count: n, memo: memo || undefined });
    if (!to || !amountUSDC) throw new Error('Pass `to` and `amountUSDC`, or `buyWallets`.');
    return spend(ROLE, to, amountUSDC, memo);
  }));

await server.connect(new StdioServerTransport());
