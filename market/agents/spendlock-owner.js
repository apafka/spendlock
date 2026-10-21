// OWNER CLI for the Spendlock vault (signs as OWNER).
//   node spendlock-owner.js status [agent]
//   node spendlock-owner.js fund 100                  (local: mints play USDC first)
//   node spendlock-owner.js policy <agent> <perTx> <daily> <budget> [approvalAbove] [expiresInDays]
//   node spendlock-owner.js allow <agent> <target|escrow> [false]
//   node spendlock-owner.js pause <agent> [false]  |  kill [false]
//   node spendlock-owner.js approve <requestId>    |  reject <requestId> [reason]
import { NETWORK, account, publicClient, fromUnits } from './config.js';
import { vault, status, fund, setPolicy, ownerTx, approve, reject, REQ_STATUS } from './spendlock.js';

const [cmd, a1, a2, a3, a4, a5, a6] = process.argv.slice(2);
const target = (t) => (t === 'escrow' ? vault().dep.escrow : t);
const no = (x) => x === 'false' || x === 'off';
const show = (o) => console.log(JSON.stringify(o, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));

if (cmd === 'status') {
  const v = vault();
  const n = Number(await publicClient.readContract({ address: v.address, abi: v.abi, functionName: 'agentCount' }));
  const agents = a1 ? [a1] : await Promise.all([...Array(n).keys()].map((i) => publicClient.readContract({ address: v.address, abi: v.abi, functionName: 'agentList', args: [BigInt(i)] })));
  for (const a of agents) show(await status(a));
  const reqs = Number(await publicClient.readContract({ address: v.address, abi: v.abi, functionName: 'requestCount' }));
  for (let i = 1; i <= reqs; i++) {
    const r = await publicClient.readContract({ address: v.address, abi: v.abi, functionName: 'getRequest', args: [BigInt(i)] });
    console.log(`request #${i}: ${REQ_STATUS[r.status]} $${fromUnits(r.amount)} -> ${r.to} by ${r.agent} "${r.memo}"`);
  }
} else if (cmd === 'fund') show(await fund(Number(a1), { mint: NETWORK === 'local' }).then((r) => r.transactionHash));
else if (cmd === 'policy') {
  const exp = a6 ? Math.floor(Date.now() / 1000) + Number(a6) * 86400 : 0;
  show((await setPolicy(a1, { perTxUSDC: a2, dailyUSDC: a3, budgetUSDC: a4, approvalAboveUSDC: a5 || 0, expiresAt: exp })).transactionHash);
} else if (cmd === 'allow') show((await ownerTx('setAllowed', [a1, target(a2), !no(a3)])).transactionHash);
else if (cmd === 'pause') show((await ownerTx('setAgentPaused', [a1, !no(a2)])).transactionHash);
else if (cmd === 'kill') show((await ownerTx('setKill', [!no(a1)])).transactionHash);
else if (cmd === 'approve') show(await approve(a1));
else if (cmd === 'reject') show(await reject(a1, a2));
else { console.log('Owner account:', account('OWNER').address); console.log(await import('node:fs').then((f) => f.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(0, 8).join('\n'))); }
