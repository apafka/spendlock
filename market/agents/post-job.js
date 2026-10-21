// CLIENT agent: lock USDC in escrow for a job.  node post-job.js --spec data/demo-spec.json [--id-out file.json]
// Prints the new job id; --id-out also writes {"jobId": N} to a per-order file (used by buy.js).
import fs from 'node:fs';
import { publicClient, wallet, account, artifact, loadDeployment, toUnits, MAX_SPEND_USDC, NETWORK } from './config.js';
import { arg, readJson, writeJson, jobFile, hashFile, withLock } from './lib.js';
import { zeroAddress, parseEventLogs } from 'viem';

const specPath = arg('spec', 'data/demo-spec.json');
const spec = readJson(specPath);
const dep = loadDeployment();
const budget = spec.maxItems * spec.pricePerItemUSDC;
if (budget > MAX_SPEND_USDC) throw new Error(`Budget $${budget} exceeds MAX_SPEND_USDC=$${MAX_SPEND_USDC} (Spendlock brake)`);

const w = wallet('CLIENT');
const escrow = { address: dep.escrow, abi: artifact('ResultEscrow').abi };
const usdc = { address: dep.usdc, abi: artifact('MockUSDC').abi };
const specHash = hashFile(specPath);
const deadline = BigInt(Math.floor(Date.now() / 1000) + spec.deadlineHours * 3600);
const verifier = process.env.VERIFIER_ADDRESS || account('VERIFIER').address;

// mint -> approve -> createJob must not interleave with another buy using the same CLIENT key
// (shared nonce, and a second approve would overwrite the first one's allowance).
const jobId = await withLock('CLIENT', async () => {
  if (NETWORK === 'local') { // free play money on the local chain only
    await publicClient.waitForTransactionReceipt({ hash: await w.writeContract({ ...usdc, functionName: 'mint', args: [account('CLIENT').address, toUnits(1000)] }) });
  }
  // 1) allow the escrow to pull exactly the budget
  await publicClient.waitForTransactionReceipt({ hash: await w.writeContract({ ...usdc, functionName: 'approve', args: [dep.escrow, toUnits(budget)] }) });
  // 2) create the job (this moves the USDC into the escrow)
  const { request } = await publicClient.simulateContract({
    ...escrow, account: w.account, functionName: 'createJob',
    args: [zeroAddress, verifier, BigInt(spec.maxItems), toUnits(spec.pricePerItemUSDC), deadline, specHash],
  });
  const rcpt = await publicClient.waitForTransactionReceipt({ hash: await w.writeContract(request) });
  // The id comes from the mined event, not the simulation: someone else may have created a job in between.
  return parseEventLogs({ abi: escrow.abi, logs: rcpt.logs, eventName: 'JobCreated' })[0].args.jobId;
});
fs.copyFileSync(specPath, jobFile(jobId, 'spec'));
const idOut = arg('id-out');
if (idOut) writeJson(idOut, { jobId: Number(jobId) });
console.log(`CLIENT  posted job #${jobId}: "${spec.title}" — locked $${budget} USDC (${spec.maxItems} x $${spec.pricePerItemUSDC}), verifier ${verifier}`);
