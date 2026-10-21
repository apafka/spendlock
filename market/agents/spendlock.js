// SPENDLOCK helpers: an agent spends from the owner's vault under onchain rules.
// Used by spendlock-mcp.js (agent tools), spendlock-owner.js (owner CLI) and demo-spendlock.js.
// Every rule lives in contracts/src/Spendlock.sol; this file only builds transactions and reads events.
import fs from 'node:fs';
import path from 'node:path';
import { encodeFunctionData, parseEventLogs, keccak256, toBytes, zeroAddress, getAddress } from 'viem';
import { publicClient, wallet, account, artifact, loadDeployment, toUnits, fromUnits } from './config.js';
import { jobFile, jobsDir, writeJson, readJson, withLock } from './lib.js';
import { buildSpec, newOrder, fulfilJob } from './buy.js';

export const RESULT = ['Executed', 'Pending', 'Rejected'];
export const REQ_STATUS = ['None', 'Pending', 'Approved', 'Rejected', 'Cancelled'];
const reqDir = path.join(jobsDir, 'spendlock-requests'); // requestId -> order folder, for approved escrow buys

export function vault() {
  const dep = loadDeployment();
  if (!dep.spendlock) throw new Error('Spendlock is not deployed on this network. Run: node deploy-spendlock.js');
  return { address: dep.spendlock, abi: artifact('Spendlock').abi, dep };
}
const usdcAbi = () => artifact('MockUSDC').abi;
const escrowAbi = () => artifact('ResultEscrow').abi;

// Send one tx as `role` and return its receipt. One tx at a time per key (nonce safety).
async function send(role, address, abi, functionName, args) {
  const w = wallet(role);
  return withLock(role, async () => {
    const { request } = await publicClient.simulateContract({ account: w.account, address, abi, functionName, args });
    return publicClient.waitForTransactionReceipt({ hash: await w.writeContract(request) });
  });
}
export const ownerTx = (functionName, args) => { const v = vault(); return send('OWNER', v.address, v.abi, functionName, args); };

// Turn a receipt into one plain outcome: executed / pending / rejected (+ reason, request id, escrow job id).
export function outcome(rcpt) {
  const { abi } = vault();
  const evs = parseEventLogs({ abi, logs: rcpt.logs });
  const out = { tx: rcpt.transactionHash };
  for (const e of evs) {
    if (e.eventName === 'Spent') Object.assign(out, { status: 'executed', amountUSDC: fromUnits(e.args.amount), to: e.args.to, requestId: Number(e.args.requestId) });
    if (e.eventName === 'SpendRequested') Object.assign(out, { status: 'pending', amountUSDC: fromUnits(e.args.amount), to: e.args.to, requestId: Number(e.args.requestId) });
    if (e.eventName === 'SpendRejected') Object.assign(out, { status: 'rejected', reason: e.args.reason, amountUSDC: fromUnits(e.args.amount), to: e.args.to, requestId: Number(e.args.requestId) });
  }
  const [job] = parseEventLogs({ abi: escrowAbi(), logs: rcpt.logs, eventName: 'JobCreated' });
  if (job) out.escrowJobId = Number(job.args.jobId);
  return out;
}

/** What `agentAddr` may still spend, its rules, and its allowlist (from onchain state + events). */
export async function status(agentAddr) {
  const v = vault();
  const read = (functionName, args = []) => publicClient.readContract({ address: v.address, abi: v.abi, functionName, args });
  const [perTxCap, dailyLimit, totalBudget, approvalThreshold, expiry, active, paused] = await read('policies', [agentAddr]);
  const [perTx, today, budget, spendableNow] = await read('remaining', [agentAddr]);
  const killed = await read('killed');
  const vaultBalance = await read('balance');
  const logs = await publicClient.getContractEvents({ address: v.address, abi: v.abi, eventName: 'AllowlistSet', args: { agent: agentAddr }, fromBlock: 0n });
  const allow = new Map(); for (const l of logs) allow.set(l.args.target, l.args.allowed);
  const named = { [getAddress(v.dep.escrow)]: 'ResultEscrow' };
  return {
    agent: agentAddr, active, paused, killSwitch: killed, vaultUSDC: fromUnits(vaultBalance),
    rules: { perTxCapUSDC: fromUnits(perTxCap), dailyLimitUSDC: fromUnits(dailyLimit), totalBudgetUSDC: fromUnits(totalBudget),
      approvalAboveUSDC: approvalThreshold ? fromUnits(approvalThreshold) : 'never', expires: expiry ? new Date(Number(expiry) * 1000).toISOString() : 'never' },
    remaining: { perTxUSDC: fromUnits(perTx), todayUSDC: fromUnits(today), budgetUSDC: fromUnits(budget), spendableNowUSDC: fromUnits(spendableNow) },
    allowedRecipients: [...allow].filter(([, ok]) => ok).map(([a]) => (named[getAddress(a)] ? `${a} (${named[getAddress(a)]})` : a)),
  };
}

/** Plain USDC payment from the vault: spend(to, amount, memo). */
export async function spend(role, to, amountUSDC, memo = '') {
  const v = vault();
  return outcome(await send(role, v.address, v.abi, 'spend', [to, toUnits(amountUSDC), memo]));
}

// Chain time, not wall-clock: the escrow deadline must be in the future on THIS chain.
const chainNow = async () => Number((await publicClient.getBlock()).timestamp);

/** Buy verified Hyperliquid wallets through ResultEscrow, paid from the vault (approveAndCall -> createJob).
 *  The vault is the escrow client, so unverified items are refunded into the vault.
 *  executed -> the job is fulfilled right away; pending -> fulfil after the owner approves (fulfilApproved). */
export async function buyWallets(role, { count, overrides = {}, memo } = {}) {
  const v = vault();
  const spec = buildSpec({ count, overrides, note: `Bought by ${role} from a Spendlock vault.` });
  const order = newOrder();
  const specText = JSON.stringify({ ...spec, orderId: order.orderId }, null, 2);
  const specPath = path.join(order.dir, 'spec.json');
  fs.writeFileSync(specPath, specText);
  const budget = toUnits(count * spec.pricePerItemUSDC);
  const deadline = BigInt((await chainNow()) + spec.deadlineHours * 3600);
  const data = encodeFunctionData({ abi: escrowAbi(), functionName: 'createJob',
    args: [zeroAddress, process.env.VERIFIER_ADDRESS || account('VERIFIER').address, BigInt(count), toUnits(spec.pricePerItemUSDC), deadline, keccak256(toBytes(specText))] });
  const r = outcome(await send(role, v.address, v.abi, 'approveAndCall', [v.dep.escrow, budget, data, memo || `buy ${count} verified HL wallets`]));
  r.order = order.orderId;
  if (r.status === 'pending') { fs.mkdirSync(reqDir, { recursive: true }); writeJson(path.join(reqDir, `${r.requestId}.json`), { order: order.orderId, dir: order.dir, specPath, count }); }
  if (r.status === 'executed') r.delivery = await deliver(r.escrowJobId, specPath, count, order);
  return r;
}

async function deliver(jobId, specPath, count, order) {
  fs.copyFileSync(specPath, jobFile(jobId, 'spec'));
  const d = await fulfilJob(jobId, { count, order });
  return { jobId, verified: d.verified, failed: d.failed, needsReview: d.needsReview, paidUSDC: d.paidUSDC, settlement: d.settlement, wallets: d.wallets, log: d.log };
}

/** Owner approves a pending request; if it was an escrow buy, run the delivery too. */
export async function approve(requestId) {
  const r = outcome(await ownerTx('approveRequest', [BigInt(requestId)]));
  const f = path.join(reqDir, `${requestId}.json`);
  if (r.status === 'executed' && r.escrowJobId && fs.existsSync(f)) {
    const o = readJson(f);
    r.delivery = await deliver(r.escrowJobId, o.specPath, o.count, { orderId: o.order, dir: o.dir });
  }
  return r;
}
export const reject = async (requestId, reason = 'rejected by owner') => outcome(await ownerTx('rejectRequest', [BigInt(requestId), reason]));

/** Owner deposits USDC (mints play money first on the local chain). */
export async function fund(amountUSDC, { mint = false } = {}) {
  const v = vault();
  const amt = toUnits(amountUSDC);
  if (mint) await send('OWNER', v.dep.usdc, usdcAbi(), 'mint', [account('OWNER').address, amt]);
  await send('OWNER', v.dep.usdc, usdcAbi(), 'approve', [v.address, amt]);
  return ownerTx('fund', [amt]);
}

export async function setPolicy(agent, { perTxUSDC, dailyUSDC, budgetUSDC, approvalAboveUSDC = 0, expiresAt = 0 }) {
  return ownerTx('setPolicy', [agent, toUnits(perTxUSDC), toUnits(dailyUSDC), toUnits(budgetUSDC), toUnits(approvalAboveUSDC), BigInt(expiresAt)]);
}
