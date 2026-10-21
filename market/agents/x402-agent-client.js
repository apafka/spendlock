// SAMPLE x402 BUYER AGENT: an outside agent that buys verified wallets over plain HTTP.
// node x402-agent-client.js [--url http://127.0.0.1:4020/v1/hl-wallets] [--count 5] [--minTrades 50]
// It uses anvil dev account #4 ("BUYER", from anvil's public test mnemonic) on the LOCAL chain only.
//   1. request -> 402 with the price and the escrow terms
//   2. check the terms (price cap, chain, spec hash), approve USDC, createJob in the escrow
//   3. repeat the request with X-PAYMENT -> 200 + verified report + X-PAYMENT-RESPONSE
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { keccak256, toBytes, parseEventLogs } from 'viem';
import { NETWORK, NET, MAX_SPEND_USDC, publicClient, wallet, account, artifact, toUnits, fromUnits } from './config.js';
import { arg, withLock } from './lib.js';

// node:http instead of fetch: a paid request is held open for minutes while the job runs.
export function request(url, { method = 'POST', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      let data = ''; res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) }); } catch (e) { reject(e); } });
    });
    req.on('error', reject); req.setTimeout(0); req.end();
  });
}

export async function payAndBuy({ url, count = 5, rules = {}, log = console.log, maxSpendUSDC = MAX_SPEND_USDC, tamper } = {}) {
  if (NETWORK !== 'local') throw new Error('demo client runs on the local anvil chain only');
  const target = new URL(url); target.searchParams.set('count', String(count));
  for (const [k, v] of Object.entries(rules)) target.searchParams.set(k, String(v));

  const first = await request(target);
  if (first.status !== 402) throw new Error(`expected 402, got ${first.status}: ${JSON.stringify(first.body)}`);
  const req = first.body.accepts.find((a) => a.scheme === 'escrow');
  const x = req.extra;
  log(`AGENT   402 Payment Required: ${req.description}`);
  log(`AGENT   terms: max $${fromUnits(req.maxAmountRequired)} USDC (${x.escrow.args.maxItems} x $${fromUnits(x.escrow.args.pricePerItem)}) into escrow ${req.payTo} on chain ${x.chainId}, quote ${x.quoteId}`);

  // Do not trust the server blindly: check the terms before paying.
  if (x.chainId !== NET.chain.id) throw new Error('wrong chain');
  if (Number(fromUnits(req.maxAmountRequired)) > maxSpendUSDC) throw new Error(`price $${fromUnits(req.maxAmountRequired)} is over my cap $${maxSpendUSDC}`);
  if (keccak256(toBytes(x.spec)) !== x.escrow.args.specHash) throw new Error('spec does not match specHash');
  if (BigInt(x.escrow.args.maxItems) * BigInt(x.escrow.args.pricePerItem) !== BigInt(req.maxAmountRequired)) throw new Error('amount mismatch');
  const spec = JSON.parse(x.spec);
  log(`AGENT   rules I am paying for: ${JSON.stringify(spec.rules)}`);

  const me = wallet('BUYER');
  const escrow = { address: req.payTo, abi: artifact('ResultEscrow').abi };
  const usdc = { address: req.asset, abi: artifact('MockUSDC').abi };
  const a = x.escrow.args;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + a.minDeadlineSecondsFromNow + 600);
  const specHash = tamper === 'specHash' ? keccak256(toBytes('something else')) : a.specHash;
  const { jobId, txHash } = await withLock('BUYER', async () => {
    // Local play money: MockUSDC lets anyone mint. On a real chain the agent would already hold USDC.
    await publicClient.waitForTransactionReceipt({ hash: await me.writeContract({ ...usdc, functionName: 'mint', args: [me.account.address, toUnits(100)] }) });
    await publicClient.waitForTransactionReceipt({ hash: await me.writeContract({ ...usdc, functionName: 'approve', args: [req.payTo, BigInt(req.maxAmountRequired)] }) });
    const { request: tx } = await publicClient.simulateContract({ ...escrow, account: me.account, functionName: 'createJob',
      args: [a.worker, a.verifier, BigInt(a.maxItems), BigInt(a.pricePerItem), deadline, specHash] });
    const hash = await me.writeContract(tx);
    const rcpt = await publicClient.waitForTransactionReceipt({ hash });
    return { jobId: Number(parseEventLogs({ abi: escrow.abi, logs: rcpt.logs, eventName: 'JobCreated' })[0].args.jobId), txHash: hash };
  });
  log(`AGENT   locked $${fromUnits(req.maxAmountRequired)} in escrow: job #${jobId}, tx ${txHash.slice(0, 18)}…; retrying with X-PAYMENT`);

  const payment = Buffer.from(JSON.stringify({ x402Version: 1, scheme: 'escrow', network: req.network, payload: { quoteId: x.quoteId, jobId, txHash } })).toString('base64');
  const t0 = Date.now();
  const paid = await request(target, { headers: { 'X-PAYMENT': payment } });
  const receipt = paid.headers['x-payment-response'] ? JSON.parse(Buffer.from(paid.headers['x-payment-response'], 'base64').toString()) : null;
  return { status: paid.status, body: paid.body, receipt, jobId, txHash, quoteId: x.quoteId, payment, seconds: Math.round((Date.now() - t0) / 1000) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rules = Object.fromEntries(['minTrades', 'minRealizedPnlUsd', 'minAccountValueUsd', 'windowDays'].filter((k) => arg(k) != null).map((k) => [k, Number(arg(k))]));
  const r = await payAndBuy({ url: arg('url', 'http://127.0.0.1:4020/v1/hl-wallets'), count: Number(arg('count', 5)), rules });
  if (r.status !== 200) { console.error(`AGENT   paid request failed: HTTP ${r.status}`, JSON.stringify(r.body, null, 2)); process.exit(1); }
  const b = r.body;
  b.log.forEach((l) => console.log('  ' + l));
  console.log(`AGENT   HTTP 200 after ${r.seconds}s. X-PAYMENT-RESPONSE: ${JSON.stringify(r.receipt)}`);
  console.log(`AGENT   got ${b.verified} verified wallets for $${b.paidUSDC} (${b.needsReview} review, ${b.failed} fail; refund $${b.settlement?.refundUSDC}):`);
  b.wallets.forEach((w) => console.log(`  ✔ ${w.address}  ${w.proof}`));
  // Replaying the same payment must not buy a second list.
  const again = await request(new URL(`${arg('url', 'http://127.0.0.1:4020/v1/hl-wallets')}?count=${arg('count', 5)}`), { headers: { 'X-PAYMENT': r.payment } });
  console.log(`AGENT   replaying the same X-PAYMENT -> HTTP ${again.status} (${again.body.error})`);
  console.log(`AGENT   buyer ${account('BUYER').address}`);
}
