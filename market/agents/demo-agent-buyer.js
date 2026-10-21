// DEMO BUYER AGENT: an outside agent that connects to our MCP server and buys verified wallets.
// node demo-agent-buyer.js [--count 5]   (needs a deployed escrow; see ../demo-mcp.sh)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { arg } from './lib.js';

const client = new Client({ name: 'demo-agent-buyer', version: '0.1.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp-server.js'], env: process.env }));
const { tools } = await client.listTools();
console.log(`BUYER   connected; tools: ${tools.map((t) => t.name).join(', ')}`);
const offer = JSON.parse((await client.callTool({ name: 'get_offer', arguments: {} })).content[0].text);
const p = offer.products[0];
console.log(`BUYER   offer: "${p.title}" at $${p.pricePerItemUSDC}/wallet on ${offer.network}`);
const count = Number(arg('count', 5));
console.log(`BUYER   buying ${count} wallets (budget $${count * p.pricePerItemUSDC})...`);
const res = await client.callTool({ name: 'buy_verified_wallets', arguments: { count } }, undefined, { timeout: 30 * 60 * 1000 });
if (res.isError) { console.error(res.content[0].text); process.exit(1); }
const r = JSON.parse(res.content[0].text);
r.log.forEach((l) => console.log('  ' + l));
console.log(`BUYER   got ${r.verified} verified wallets for $${r.paidUSDC} (${r.needsReview} review, ${r.failed} fail, refunded):`);
r.wallets.forEach((w) => console.log(`  ✔ ${w.address}  ${w.proof}`));
await client.close();
