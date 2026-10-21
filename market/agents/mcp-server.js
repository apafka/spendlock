// MCP SERVER: lets any AI agent BUY a verified Hyperliquid wallet list, paid per verified wallet.
// Run: node mcp-server.js  (stdio). Add to Cursor/Claude as a stdio MCP server.
// Each purchase runs the real pipeline: lock USDC in escrow -> worker builds the list -> checker
// re-verifies every wallet on the public Hyperliquid API -> escrow pays per pass, refunds the rest.
// Network comes from NETWORK (default local anvil = play money). MAX_SPEND_USDC is the hard brake.
import fs from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { NETWORK, MAX_SPEND_USDC } from './config.js';
import { jobFile } from './lib.js';
import { BASE_SPEC, buyVerifiedWallets, summarize } from './buy.js';

const server = new McpServer({ name: 'verified-results', version: '0.1.0' });

server.tool('get_offer', 'What you can buy, the price, and the rules every result must pass.', {}, async () => ({
  content: [{ type: 'text', text: JSON.stringify({
    network: NETWORK, maxSpendUSDC: MAX_SPEND_USDC,
    products: [{ resultType: BASE_SPEC.resultType, title: BASE_SPEC.title, pricePerItemUSDC: BASE_SPEC.pricePerItemUSDC,
      defaultRules: BASE_SPEC.rules, payment: 'USDC escrow; you pay only for wallets that pass the checker, the rest is refunded' }],
  }, null, 2) }],
}));

server.tool('buy_verified_wallets',
  'Buy a list of Hyperliquid wallets that verifiably meet your rules. Locks count x price in USDC escrow, pays only per verified wallet, refunds the rest. Takes a few minutes.',
  {
    count: z.number().int().min(1).max(30).describe('How many wallets you want (budget = count x price).'),
    minRealizedPnlUsd: z.number().min(0).optional().describe('Minimum realized PnL over the window, USD.'),
    minTrades: z.number().int().min(1).optional(),
    minAccountValueUsd: z.number().min(0).optional(),
    windowDays: z.number().int().min(1).max(30).optional(),
  },
  async ({ count, ...overrides }) => {
    const budget = count * BASE_SPEC.pricePerItemUSDC;
    if (budget > MAX_SPEND_USDC) return { isError: true, content: [{ type: 'text', text: `Budget $${budget} exceeds MAX_SPEND_USDC=$${MAX_SPEND_USDC}.` }] };
    try {
      const r = await buyVerifiedWallets({ count, overrides }); // own order folder + own job id: safe to run in parallel
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: `Purchase failed: ${e.stderr || e.message}\n${e.stdout || ''}` }] };
    }
  });

server.tool('get_job_report', 'Fetch the checker report (every wallet, pass/fail/review and why) for a past job.',
  { jobId: z.number().int().min(1) }, async ({ jobId }) => {
    if (!fs.existsSync(jobFile(jobId, 'report'))) return { isError: true, content: [{ type: 'text', text: `No report for job #${jobId}` }] };
    return { content: [{ type: 'text', text: JSON.stringify(summarize(jobId), null, 2) }] };
  });

await server.connect(new StdioServerTransport());
