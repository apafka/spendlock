// VERIFIER agent: check every lead, then settle on-chain.  node verifier.js --job 1  (--job is required)
import { publicClient, wallet, artifact, loadDeployment, fromUnits } from './config.js';
import { readJson, writeJson, jobFile, hashFile, STATUS, jobIdArg, withLock } from './lib.js';
import { verifyLeads } from './leadRules.js';
import { verifyWallets } from './walletRules.js';
import { decodeEventLog } from 'viem';

const jobId = jobIdArg();
const dep = loadDeployment();
const escrow = { address: dep.escrow, abi: artifact('ResultEscrow').abi };
const job = await publicClient.readContract({ ...escrow, functionName: 'jobs', args: [jobId] });
const [, , , , , , status, specHash, resultHash] = job;
if (STATUS[status] !== 'Submitted') throw new Error(`Job #${jobId} is ${STATUS[status]}, not Submitted`);

// 1) Make sure the files are exactly the ones committed on-chain.
if (hashFile(jobFile(jobId, 'spec')) !== specHash) throw new Error('spec file does not match on-chain hash');
if (hashFile(jobFile(jobId, 'result')) !== resultHash) throw new Error('result file does not match on-chain hash');

// 2) Run the rules.
const spec = readJson(jobFile(jobId, 'spec'));
// Pick the rule set by result type: Hyperliquid wallets (main niche) or company leads (BESS example).
const result = readJson(jobFile(jobId, 'result'));
const isWallets = spec.resultType === 'hl-wallets/v1';
const leads = isWallets ? result.wallets : result.leads;
const { verified, needsReview, items } = await (isWallets ? verifyWallets : verifyLeads)(leads, spec);
const ICON = { pass: '✔', fail: '✘', review: '?' };
for (const it of items) console.log(`  ${ICON[it.status]} ${String(it.company).slice(0, 34).padEnd(34)} ${it.domain.padEnd(22)} ${it.reason}`);
// The report is the receipt: every item, every rule, pass/fail and why. Its hash goes on-chain.
const report = jobFile(jobId, 'report');
writeJson(report, {
  jobId: Number(jobId), title: spec.title, resultType: spec.resultType, rules: spec.rules || {}, submitted: leads.length,
  verifiedCount: verified.length, reviewCount: needsReview.length, failedCount: items.length - verified.length - needsReview.length,
  note: 'pass = paid; fail and review = refunded to client. Review items are listed for a human to check.',
  items, checkedAt: new Date().toISOString(),
});
console.log(`  ${verified.length} pass · ${needsReview.length} needs review (refunded) · ${items.length - verified.length - needsReview.length} fail — report saved: ${report}`);

// 3) Settle: pay per verified lead, refund the rest.
const w = wallet('VERIFIER');
const rcpt = await withLock('VERIFIER', async () => { // one tx at a time per key (nonce)
  const hash = await w.writeContract({ ...escrow, functionName: 'settle', args: [jobId, BigInt(verified.length), hashFile(report)] });
  return publicClient.waitForTransactionReceipt({ hash });
});
for (const log of rcpt.logs) {
  try {
    const ev = decodeEventLog({ abi: escrow.abi, ...log });
    if (ev.eventName === 'JobSettled') {
      const a = ev.args;
      console.log(`VERIFIER settled job #${jobId}: ${a.verifiedCount}/${leads.length} verified -> worker $${fromUnits(a.toWorker)}, fee $${fromUnits(a.fee)}, refund to client $${fromUnits(a.refund)}`);
    }
  } catch {}
}
