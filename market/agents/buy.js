// THE BUY PIPELINE, shared by the MCP server (mcp-server.js) and the x402 HTTP endpoint (x402-server.js).
// feed -> (escrow job) -> worker -> checker -> settle. Every order gets its own folder and every job
// is addressed by its on-chain id, so any number of buys can run at the same time.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT, NETWORK, MAX_SPEND_USDC, publicClient, artifact, loadDeployment, fromUnits } from './config.js';
import { readJson, writeJson, jobFile, jobsDir } from './lib.js';

const run = promisify(execFile);
const AGENTS = path.join(ROOT, 'agents');
export const BASE_SPEC = readJson(path.join(AGENTS, 'data', 'hl-wallets-spec.json'));
export const RULE_KEYS = ['minRealizedPnlUsd', 'minTrades', 'minAccountValueUsd', 'windowDays'];

const step = async (script, args) => {
  const { stdout } = await run('node', [script, ...args], { cwd: AGENTS, env: process.env, timeout: 20 * 60 * 1000, maxBuffer: 1 << 24 });
  return stdout.trim();
};

// A private folder per order: spec, candidates, job id. Nothing is shared between orders.
export function newOrder() {
  const orderId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const dir = path.join(jobsDir, 'orders', orderId);
  fs.mkdirSync(dir, { recursive: true });
  return { orderId, dir };
}

export function buildSpec({ count, overrides = {}, note, extra = {} }) {
  const clean = Object.fromEntries(Object.entries(overrides).filter(([k, v]) => RULE_KEYS.includes(k) && v !== undefined && v !== null));
  return { ...BASE_SPEC, maxItems: count, rules: { ...BASE_SPEC.rules, ...clean }, note: note || BASE_SPEC.note, ...extra };
}

export function summarize(jobId) {
  const r = readJson(jobFile(jobId, 'report'));
  const price = readJson(jobFile(jobId, 'spec')).pricePerItemUSDC;
  return {
    jobId: Number(jobId), network: NETWORK, title: r.title, submitted: r.submitted,
    verified: r.verifiedCount, needsReview: r.reviewCount, failed: r.failedCount,
    paidUSDC: r.verifiedCount * price, pricePerWalletUSDC: price,
    wallets: r.items.filter((i) => i.status === 'pass').map((i) => ({ address: i.address, label: i.company, proof: i.checks.filter((c) => /value|trades|pnl/.test(c.rule)).map((c) => c.detail).join('; ') })),
    reviewItems: r.items.filter((i) => i.status === 'review').map((i) => ({ address: i.address, why: i.reason })),
    reportFile: jobFile(jobId, 'report'),
  };
}

// The JobSettled event for a job: who got what, and the settle tx hash.
export async function settlementOf(jobId) {
  const dep = loadDeployment();
  const [ev] = await publicClient.getContractEvents({ address: dep.escrow, abi: artifact('ResultEscrow').abi, eventName: 'JobSettled', args: { jobId: BigInt(jobId) }, fromBlock: 0n });
  if (!ev) return null;
  return { tx: ev.transactionHash, toWorkerUSDC: fromUnits(ev.args.toWorker), feeUSDC: fromUnits(ev.args.fee), refundUSDC: fromUnits(ev.args.refund) };
}

const keepLog = (log) => log.join('\n').split('\n').filter((l) => /^(FEED|CLIENT|WORKER|VERIFIER)/.test(l));

// Deliver a job that is already funded in escrow (its spec must be at jobFile(jobId, 'spec')).
export async function fulfilJob(jobId, { count, order = newOrder(), log = [] }) {
  const candidates = path.join(order.dir, 'candidates.csv');
  log.push(await step('feed-hl.js', ['--n', String(Math.max(count * 4, 12)), '--out', candidates]));
  log.push(await step('worker.js', ['--job', String(jobId), '--candidates', candidates]));
  log.push(await step('verifier.js', ['--job', String(jobId)]));
  return { ...summarize(jobId), settlement: await settlementOf(jobId), log: keepLog(log) };
}

// Full purchase paid by our own CLIENT key (the MCP path): post the escrow job, then deliver it.
export async function buyVerifiedWallets({ count, overrides = {}, note = 'Bought by an agent over MCP.' }) {
  const spec = buildSpec({ count, overrides, note });
  const budget = count * spec.pricePerItemUSDC;
  if (budget > MAX_SPEND_USDC) throw new Error(`Budget $${budget} exceeds MAX_SPEND_USDC=$${MAX_SPEND_USDC}.`);
  const order = newOrder();
  const specPath = path.join(order.dir, 'spec.json');
  writeJson(specPath, { ...spec, orderId: order.orderId });
  const idFile = path.join(order.dir, 'job.json');
  const log = [await step('post-job.js', ['--spec', specPath, '--id-out', idFile])];
  const { jobId } = readJson(idFile); // this order's job, never someone else's
  return fulfilJob(jobId, { count, order, log });
}
