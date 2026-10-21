// SPENDLOCK DEMO (local anvil, play money). Run through ../demo-spendlock.sh.
// The owner funds a vault and sets rules; agent A spends ONLY through its MCP tools (spendlock_status / spendlock_spend).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { NETWORK, account, publicClient, fromUnits } from './config.js';
import { vault, fund, setPolicy, ownerTx, approve, spend } from './spendlock.js';

if (NETWORK !== 'local') throw new Error('The demo runs on the local chain only.');
const A = account('AGENT_A').address, B = account('AGENT_B').address;
const DATA_API = '0x00000000000000000000000000000000000da7a1'; // a pretend paid API agent B may use
const RANDOM = '0x000000000000000000000000000000000000dEaD';
const v = vault();
const bal = async () => fromUnits(await publicClient.readContract({ address: v.address, abi: v.abi, functionName: 'balance' }));
const short = (h) => `${h.slice(0, 10)}…`;
const say = (who, msg) => console.log(`${who.padEnd(7)} ${msg}`);
const rpc = (method, params = []) => fetch(process.env.LOCAL_RPC_URL || 'http://127.0.0.1:8545', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
const chainNow = async () => Number((await publicClient.getBlock()).timestamp);
async function nextUtcDay() { // jump the local chain to the next UTC day (+1h)
  const t = await chainNow(); const target = (Math.floor(t / 86400) + 1) * 86400 + 3600;
  await rpc('evm_increaseTime', [target - t]); await rpc('evm_mine');
}
const showResult = (r) => {
  if (r.status === 'executed') return `EXECUTED  $${r.amountUSDC} -> ${r.escrowJobId ? `ResultEscrow job #${r.escrowJobId}` : r.to}  tx ${short(r.tx)}`;
  if (r.status === 'pending') return `PENDING   $${r.amountUSDC} waits for the owner (request #${r.requestId})  tx ${short(r.tx)}`;
  return `REJECTED  $${r.amountUSDC} -> ${r.to}: "${r.reason}"  tx ${short(r.tx)} (rejection stored onchain)`;
};
const delivery = (d) => {
  if (!d) return;
  d.log.forEach((l) => console.log('          ' + l));
  say('', `delivered: ${d.verified} verified wallets, $${d.paidUSDC} paid; escrow paid worker $${d.settlement.toWorkerUSDC}, fee $${d.settlement.feeUSDC}, refund to VAULT $${d.settlement.refundUSDC}`);
};

// If the chain clock is within 20 min of UTC midnight, start on the next day so "same day" stays true.
if ((await chainNow()) % 86400 > 86400 - 1200) await nextUtcDay();

console.log(`\n== Spendlock vault ${v.address} (owner ${account('OWNER').address})\n`);
say('OWNER', 'funds the vault with $100 (play USDC)');
await fund(100, { mint: true });
say('OWNER', `vault balance $${await bal()}`);
const in30d = (await chainNow()) + 30 * 86400;
await setPolicy(A, { perTxUSDC: 20, dailyUSDC: 20, budgetUSDC: 60, approvalAboveUSDC: 15, expiresAt: in30d });
await ownerTx('setAllowed', [A, v.dep.escrow, true]);
say('OWNER', `agent A ${A}: $20/tx, $20/day, $60 total, owner approval above $15, expires in 30 days, may ONLY pay ResultEscrow`);
await setPolicy(B, { perTxUSDC: 10, dailyUSDC: 20, budgetUSDC: 40, approvalAboveUSDC: 5 });
await ownerTx('setAllowed', [B, DATA_API, true]);
say('OWNER', `agent B ${B}: $10/tx, $20/day, $40 total, approval above $5, may only pay the data API ${DATA_API}`);

// ---- agent A connects to its MCP tools ----
const mcp = new Client({ name: 'agent-a', version: '0.1.0' });
await mcp.connect(new StdioClientTransport({ command: 'node', args: ['spendlock-mcp.js'], env: { ...process.env, SPENDLOCK_AGENT: 'AGENT_A' } }));
const call = async (name, args = {}) => {
  const r = await mcp.callTool({ name, arguments: args }, undefined, { timeout: 20 * 60 * 1000 });
  const o = JSON.parse(r.content[0].text); if (r.isError) throw new Error(o.error); return o;
};
say('AGENT A', `MCP tools: ${(await mcp.listTools()).tools.map((t) => t.name).join(', ')}`);
let s = await call('spendlock_status');
say('AGENT A', `status: can spend $${s.remaining.spendableNowUSDC} now, $${s.remaining.todayUSDC} left today, $${s.remaining.budgetUSDC} budget; allowed: ${s.allowedRecipients.join(', ')}`);

console.log('\n-- 1) buy 5 verified wallets ($15) through ResultEscrow');
let r = await call('spendlock_spend', { buyWallets: 5, memo: 'buy 5 verified HL wallets' });
say('AGENT A', showResult(r)); delivery(r.delivery);
say('VAULT', `balance $${await bal()}`);

console.log('\n-- 2) same day, another $15 buy');
r = await call('spendlock_spend', { buyWallets: 5, memo: 'buy 5 more' });
say('AGENT A', showResult(r));

console.log('\n-- 3) pay a random address');
r = await call('spendlock_spend', { to: RANDOM, amountUSDC: 3, memo: 'tip a stranger' });
say('AGENT A', showResult(r));

console.log('\n-- 4) next UTC day: buy 6 wallets ($18 > $15 approval threshold)');
await nextUtcDay();
r = await call('spendlock_spend', { buyWallets: 6, memo: 'buy 6 wallets (needs approval)' });
say('AGENT A', showResult(r));
say('VAULT', `balance $${await bal()} (nothing moved yet)`);
const a = await approve(r.requestId);
say('OWNER', `approves request #${r.requestId}: ${showResult(a)}`); delivery(a.delivery);
say('VAULT', `balance $${await bal()}`);

console.log('\n-- 5) agent B (library call, no MCP) pays the data API');
say('AGENT B', showResult(await spend('AGENT_B', DATA_API, 4, 'market data, 1 day')));
r = await spend('AGENT_B', DATA_API, 8, 'premium data feed');
say('AGENT B', showResult(r) + ' -> left for the owner in the dashboard');

console.log('\n-- 6) kill switch');
await ownerTx('setKill', [true]);
say('OWNER', 'flips the global kill switch');
r = await call('spendlock_spend', { buyWallets: 1, memo: 'one more wallet' });
say('AGENT A', showResult(r));
say('AGENT B', showResult(await spend('AGENT_B', DATA_API, 1, 'tiny call')));
s = await call('spendlock_status');
say('AGENT A', `status: killSwitch=${s.killSwitch}, spendable now $${s.remaining.spendableNowUSDC}, budget left $${s.remaining.budgetUSDC}`);
await mcp.close();

// ---- audit trail straight from the chain ----
const evs = await publicClient.getContractEvents({ address: v.address, abi: v.abi, fromBlock: 0n });
const count = (n) => evs.filter((e) => e.eventName === n).length;
console.log(`\n== Onchain audit trail: ${evs.length} events — ${count('Spent')} Spent, ${count('SpendRejected')} SpendRejected, ${count('SpendRequested')} SpendRequested, ${count('PolicySet') + count('AllowlistSet') + count('KillSwitch')} policy changes`);
for (const e of evs.filter((x) => ['Spent', 'SpendRejected', 'SpendRequested'].includes(x.eventName))) {
  const who = e.args.agent === A ? 'A' : 'B';
  console.log(`   block ${String(e.blockNumber).padStart(3)}  ${e.eventName.padEnd(14)} agent ${who}  $${fromUnits(e.args.amount).padStart(6)}  ${e.args.reason ? `"${e.args.reason}"` : ''} ${e.args.memo}`);
}
console.log(`== Vault: $${await bal()} (funded $100; agent spends and escrow refunds all accounted for onchain)`);
