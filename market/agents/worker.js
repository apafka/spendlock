// WORKER agent: build a lead list for a job and submit it.  node worker.js --job 1 [--candidates data/candidates.csv]  (--job is required)
// v0 is deliberately "dumb": it filters a candidate CSV by country. Swap in a smarter
// lead finder later (LLM + web search, Apollo/Clay export, ...). The verifier keeps it honest.
import fs from 'node:fs';
import { publicClient, wallet, artifact, loadDeployment } from './config.js';
import { verifyWallets } from './walletRules.js';
import { arg, readJson, writeJson, jobFile, hashFile, jobIdArg, withLock } from './lib.js';

const jobId = jobIdArg();
const spec = readJson(jobFile(jobId, 'spec'));
// CSV -> objects using the header row (company,domain,country[,role,source_url]).
// Handles "quoted, fields" so names with commas don't break.
const splitCsv = (line) => (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).slice(0, -1)
  .map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
const [header, ...lines] = fs.readFileSync(arg('candidates', 'data/bess-candidates.csv'), 'utf8').trim().split('\n');
const cols = splitCsv(header);
const rows = lines.map((l) => Object.fromEntries(splitCsv(l).map((v, i) => [cols[i], v])));

const isWallets = spec.resultType === 'hl-wallets/v1'; // CSV columns: address,label,claimed_pnl_usd,claimed_trades
const allowed = new Set(spec.countries);
let leads = (isWallets ? rows : rows.filter((r) => allowed.has(r.country)));
if (isWallets && !process.argv.includes('--no-precheck')) {
  // Pre-check with the SAME rules the checker uses, so we only submit wallets likely to pass.
  // The checker still re-checks everything; this just stops the worker wasting slots.
  const { verified } = await verifyWallets(leads, { ...spec, maxItems: Infinity });
  console.log(`WORKER  pre-check: ${verified.length}/${leads.length} candidates pass the job rules`);
  leads = verified.map(({ address, label }) => ({ address, label }));
}
leads = leads.slice(0, spec.maxItems);
const out = jobFile(jobId, 'result');
writeJson(out, { jobId: Number(jobId), resultType: spec.resultType, [isWallets ? 'wallets' : 'leads']: leads });

const dep = loadDeployment();
const w = wallet('WORKER');
await withLock('WORKER', async () => { // one tx at a time per key (nonce)
  const hash = await w.writeContract({ address: dep.escrow, abi: artifact('ResultEscrow').abi, functionName: 'submitResult', args: [jobId, hashFile(out)] });
  await publicClient.waitForTransactionReceipt({ hash });
});
console.log(`WORKER  submitted ${leads.length} leads for job #${jobId} (file hash ${hashFile(out).slice(0, 12)}…)`);
