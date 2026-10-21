// x402-STYLE HTTP ENDPOINT: any agent with a wallet can buy verified Hyperliquid wallets over plain HTTP.
// Run: NETWORK=local node x402-server.js   (PORT, default 4020). LOCAL ANVIL ONLY: it refuses any other network.
//
//   1. POST /v1/hl-wallets?count=5[&minTrades=..&minRealizedPnlUsd=..&minAccountValueUsd=..&windowDays=..]
//      with no X-PAYMENT header -> HTTP 402 + payment requirements (x402 v1 body: { x402Version, error, accepts:[...] }).
//      Scheme "escrow": instead of a plain transfer, the buyer locks count x price USDC in ResultEscrow with
//      createJob(worker=0, verifier, maxItems, pricePerItem, deadline, specHash). specHash commits to a spec
//      the server issued for THIS quote (it contains the quoteId), so one payment can only redeem one quote.
//   2. Same request again with X-PAYMENT: base64(JSON { x402Version:1, scheme:"escrow", network, payload:{ quoteId, jobId, txHash } }).
//      The server checks the job on-chain (amount, price, verifier, spec hash, status Open, deadline), claims the
//      quote once, runs the same pipeline as the MCP server (feed -> worker -> checker -> settle) and answers
//      200 with the verified report + X-PAYMENT-RESPONSE. The escrow pays per verified wallet and refunds
//      the rest straight to the buyer, so "pay per verified result" is enforced by the contract, not by us.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { keccak256, toBytes, parseEventLogs, zeroAddress, getAddress } from 'viem';
import { NETWORK, NET, MAX_SPEND_USDC, publicClient, account, artifact, loadDeployment, toUnits, fromUnits } from './config.js';
import { jobFile, jobsDir, STATUS } from './lib.js';
import { buildSpec, fulfilJob, newOrder, RULE_KEYS } from './buy.js';

export const X402_NETWORK = 'anvil-local'; // chainId 31337
const QUOTE_TTL_S = 15 * 60;
const MIN_DEADLINE_S = 60 * 60; // the job must stay open at least 1h, so it can't expire mid-delivery
const quotesDir = path.join(jobsDir, 'x402-quotes');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const unb64 = (s) => JSON.parse(Buffer.from(String(s), 'base64').toString('utf8'));
const quoteFile = (id) => path.join(quotesDir, `${id}.json`);

function parseParams(url) {
  const q = url.searchParams;
  const count = Number(q.get('count') || 5);
  if (!Number.isInteger(count) || count < 1 || count > 30) throw new Error('count must be an integer 1..30');
  const overrides = {};
  for (const k of RULE_KEYS) if (q.has(k)) {
    const v = Number(q.get(k));
    if (!Number.isFinite(v) || v < 0) throw new Error(`${k} must be a number >= 0`);
    overrides[k] = v;
  }
  return { count, overrides };
}

function makeQuote(resource, { count, overrides }) {
  const quoteId = crypto.randomUUID();
  const spec = buildSpec({ count, overrides, note: 'Bought by an agent over x402 (HTTP 402).', extra: { quoteId } });
  const specText = JSON.stringify(spec, null, 2);
  const dep = loadDeployment();
  const q = {
    quoteId, resource, count, specText, specHash: keccak256(toBytes(specText)),
    pricePerItem: toUnits(spec.pricePerItemUSDC).toString(), maxAmount: toUnits(count * spec.pricePerItemUSDC).toString(),
    verifier: account('VERIFIER').address, escrow: dep.escrow, usdc: dep.usdc,
    expiresAt: Math.floor(Date.now() / 1000) + QUOTE_TTL_S,
  };
  fs.mkdirSync(quotesDir, { recursive: true });
  fs.writeFileSync(quoteFile(quoteId), JSON.stringify(q, null, 2));
  return q;
}

function paymentRequired(res, resource, params, error) {
  const q = makeQuote(resource, params);
  const body = {
    x402Version: 1, error,
    accepts: [{
      scheme: 'escrow', network: X402_NETWORK, maxAmountRequired: q.maxAmount, asset: q.usdc, payTo: q.escrow,
      resource, mimeType: 'application/json', maxTimeoutSeconds: QUOTE_TTL_S,
      description: `${q.count} verified Hyperliquid wallets at $${fromUnits(q.pricePerItem)} each. You pay only for wallets that pass the checker; the escrow refunds the rest to you.`,
      extra: {
        chainId: NET.chain.id, quoteId: q.quoteId, expiresAt: q.expiresAt,
        escrow: { contract: q.escrow, function: 'createJob(address worker,address verifier,uint96 maxItems,uint256 pricePerItem,uint64 deadline,bytes32 specHash)',
          args: { worker: zeroAddress, verifier: q.verifier, maxItems: q.count, pricePerItem: q.pricePerItem, minDeadlineSecondsFromNow: MIN_DEADLINE_S, specHash: q.specHash } },
        approve: { token: q.usdc, spender: q.escrow, amount: q.maxAmount },
        spec: q.specText, // exact bytes; keccak256(spec) == specHash
        priceUSDC: { perWallet: Number(fromUnits(q.pricePerItem)), max: Number(fromUnits(q.maxAmount)) },
        retryWith: 'X-PAYMENT: base64(JSON {x402Version:1, scheme:"escrow", network, payload:{quoteId, jobId, txHash}})',
      },
    }],
  };
  res.writeHead(402, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body, null, 2));
}

// Check a payment against the chain. Returns { quote, jobId, payer } or throws with a reason.
export async function verifyPayment(header) {
  let p; try { p = unb64(header); } catch { throw new Error('X-PAYMENT is not base64 JSON'); }
  if (p.x402Version !== 1 || p.scheme !== 'escrow' || p.network !== X402_NETWORK) throw new Error('unsupported x402Version/scheme/network');
  const { quoteId, jobId, txHash } = p.payload || {};
  if (!/^[0-9a-f-]{36}$/.test(String(quoteId)) || !fs.existsSync(quoteFile(quoteId))) throw new Error('unknown quote');
  const quote = JSON.parse(fs.readFileSync(quoteFile(quoteId), 'utf8'));
  if (fs.existsSync(quoteFile(quoteId) + '.used')) throw new Error('quote already redeemed');
  if (Date.now() / 1000 > quote.expiresAt) throw new Error('quote expired');
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(txHash))) throw new Error('bad txHash');
  const dep = loadDeployment();
  const abi = artifact('ResultEscrow').abi;
  const rcpt = await publicClient.getTransactionReceipt({ hash: txHash }).catch(() => null);
  if (!rcpt || rcpt.status !== 'success') throw new Error('payment tx not found or reverted');
  const created = parseEventLogs({ abi, logs: rcpt.logs.filter((l) => l.address.toLowerCase() === dep.escrow.toLowerCase()), eventName: 'JobCreated' })
    .find((e) => e.args.jobId === BigInt(jobId));
  if (!created) throw new Error(`tx ${txHash} did not create job #${jobId} in the escrow`);
  const [client, worker, verifier, maxItems, pricePerItem, deadline, status, specHash] = await publicClient.readContract({ address: dep.escrow, abi, functionName: 'jobs', args: [BigInt(jobId)] });
  const bad = [];
  if (STATUS[status] !== 'Open') bad.push(`job is ${STATUS[status]}, not Open`);
  if (specHash !== quote.specHash) bad.push('specHash does not match the quote');
  if (getAddress(verifier) !== getAddress(quote.verifier)) bad.push('wrong verifier');
  if (worker !== zeroAddress && getAddress(worker) !== getAddress(account('WORKER').address)) bad.push('job is reserved for another worker');
  if (BigInt(maxItems) !== BigInt(quote.count)) bad.push(`maxItems ${maxItems} != ${quote.count}`);
  if (BigInt(pricePerItem) !== BigInt(quote.pricePerItem)) bad.push('wrong pricePerItem');
  if (Number(deadline) < Date.now() / 1000 + MIN_DEADLINE_S - 120) bad.push('deadline too soon');
  if (bad.length) throw new Error(`payment rejected: ${bad.join('; ')}`);
  // Claim the quote exactly once (atomic create). A replayed X-PAYMENT fails here.
  try { fs.writeFileSync(quoteFile(quoteId) + '.used', JSON.stringify({ jobId: Number(jobId), txHash }), { flag: 'wx' }); }
  catch { throw new Error('quote already redeemed'); }
  return { quote, jobId: Number(jobId), payer: getAddress(client) };
}

export function createX402Server() {
  if (NETWORK !== 'local') throw new Error(`x402-server runs on the local anvil chain only (NETWORK=${NETWORK})`);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const json = (code, o, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(o, null, 2)); };
    try {
      if (req.method === 'GET' && url.pathname === '/health') return json(200, { ok: true, network: NETWORK, chainId: NET.chain.id });
      if (url.pathname !== '/v1/hl-wallets' || !['GET', 'POST'].includes(req.method)) return json(404, { error: 'try POST /v1/hl-wallets?count=5' });
      let params; try { params = parseParams(url); } catch (e) { return json(400, { error: e.message }); }
      const resource = `${url.origin}${url.pathname}`;
      const header = req.headers['x-payment'];
      if (!header) {
        const budget = params.count * buildSpec(params).pricePerItemUSDC;
        if (budget > MAX_SPEND_USDC) return json(400, { error: `budget $${budget} exceeds MAX_SPEND_USDC=$${MAX_SPEND_USDC}` });
        return paymentRequired(res, resource, params, 'X-PAYMENT header is required');
      }
      let paid; try { paid = await verifyPayment(header); } catch (e) { return paymentRequired(res, resource, params, e.message); }
      const { quote, jobId, payer } = paid;
      fs.writeFileSync(jobFile(jobId, 'spec'), quote.specText); // exact bytes, so the checker's hash check passes
      console.log(`X402    paid: job #${jobId} by ${payer}, ${quote.count} wallets, escrow $${fromUnits(quote.maxAmount)}`);
      let report;
      try { report = await fulfilJob(jobId, { count: quote.count, order: newOrder() }); }
      catch (e) {
        return json(500, { error: `delivery failed: ${String(e.stderr || e.message).slice(0, 2000)}`, jobId,
          note: 'Your USDC stays in escrow; call refundExpired(jobId) on the escrow after the job deadline to get it all back.' });
      }
      console.log(`X402    job #${jobId} settled: ${report.verified}/${report.submitted} verified, paid $${report.paidUSDC}`);
      const receipt = { success: true, network: X402_NETWORK, payer, jobId, escrowTx: JSON.parse(fs.readFileSync(quoteFile(quote.quoteId) + '.used', 'utf8')).txHash,
        transaction: report.settlement?.tx, paidUSDC: report.paidUSDC, refundUSDC: Number(report.settlement?.refundUSDC ?? 0) };
      return json(200, { ...report, payer }, { 'x-payment-response': b64(receipt), 'access-control-expose-headers': 'X-PAYMENT-RESPONSE' });
    } catch (e) {
      return json(500, { error: e.message });
    }
  });
  server.requestTimeout = 0; server.headersTimeout = 0; server.timeout = 0; // a delivery takes minutes
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4020);
  createX402Server().listen(port, '127.0.0.1', () => console.log(`X402    listening on http://127.0.0.1:${port}/v1/hl-wallets (network ${NETWORK}, play money)`));
}
