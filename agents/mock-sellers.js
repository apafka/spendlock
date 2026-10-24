// Local mock x402 sellers. HTTP 402 Payment Required → pay in (play) USDC → retry with proof.
// The fourth seller is a verified company record: Spendlock pays only if the page matches.
// Local / simulated only. No mainnet, no real funds.
import http from 'node:http';
import crypto from 'node:crypto';
import { COMPANY_RECORD_TYPE } from './verify-company.js';

export const X402_NETWORK = 'spendlock-sim';
export const VERIFIED_COMPANY_CLAIM =
  'domain serves a page whose title or content matches the company name';

const FIXTURES = {
  '/fixture/acme': `<!doctype html><html><head><title>Acme Tools</title></head><body><h1>Acme Tools</h1><p>Industrial widgets.</p></body></html>`,
  '/fixture/wrong': `<!doctype html><html><head><title>Unrelated Inc</title></head><body><h1>Unrelated Inc</h1><p>Nothing about Acme.</p></body></html>`,
};

function companyRecordFor(url) {
  const origin = url.origin;
  const bad = url.searchParams.get('delivery') === 'bad';
  return {
    name: 'Acme Tools',
    domain: bad ? 'wrong.example' : 'acme.example',
    claim: VERIFIED_COMPANY_CLAIM,
    evidenceUrl: `${origin}${bad ? '/fixture/wrong' : '/fixture/acme'}`,
  };
}

export const SELLER_CATALOG = [
  {
    id: 'price-feed',
    name: 'Price feed',
    path: '/v1/price',
    priceUSDC: 0.02,
    description: 'Live USD price tick',
    address: '0x000000000000000000000000000000000000feed',
    payload: () => ({ seller: 'price-feed', symbol: 'USDC', usd: 1, asOf: new Date().toISOString() }),
  },
  {
    id: 'company-data',
    name: 'Company data',
    path: '/v1/company',
    priceUSDC: 0.5,
    description: 'Company profile snapshot',
    address: '0x000000000000000000000000000000000000c0da',
    payload: () => ({ seller: 'company-data', name: 'Acme Bio', employees: 40, sector: 'tools' }),
  },
  {
    id: 'dataset',
    name: 'Expensive dataset',
    path: '/v1/dataset',
    priceUSDC: 25,
    description: 'Full research dataset',
    address: '0x000000000000000000000000000000000000da7a',
    payload: () => ({ seller: 'dataset', rows: 10_000, topic: 'onchain flow', note: 'simulated' }),
  },
  {
    id: 'verified-company',
    name: 'Verified company',
    path: '/v1/verified-company',
    priceUSDC: 0.08,
    description: 'Name + domain; paid only if the page matches',
    address: '0x000000000000000000000000000000000000cec0',
    resultType: COMPANY_RECORD_TYPE,
    resultFor: companyRecordFor,
    payload: (url) => ({ seller: 'verified-company', ...companyRecordFor(url) }),
  },
];

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const unb64 = (s) => JSON.parse(Buffer.from(String(s), 'base64').toString('utf8'));
const toUnits = (usdc) => String(Math.round(Number(usdc) * 1e6));

export function encodePayment({ quoteId, amountUSDC, agent, txHash, network = X402_NETWORK }) {
  return b64({
    x402Version: 1,
    scheme: 'exact',
    network,
    payload: {
      quoteId,
      amount: amountUSDC,
      payer: agent,
      simulated: true,
      txHash: txHash || `sim-${quoteId}`,
    },
  });
}

function paymentRequired(res, resource, catalog, quotes, error, extra = {}) {
  const quoteId = crypto.randomUUID();
  const quote = {
    quoteId,
    resource,
    priceUSDC: catalog.priceUSDC,
    expiresAt: Math.floor(Date.now() / 1000) + 15 * 60,
  };
  quotes.set(quoteId, quote);
  const body = {
    x402Version: 1,
    error: error || 'X-PAYMENT header is required',
    accepts: [
      {
        scheme: 'exact',
        network: X402_NETWORK,
        maxAmountRequired: toUnits(catalog.priceUSDC),
        asset: 'USDC',
        payTo: catalog.address,
        resource,
        mimeType: 'application/json',
        maxTimeoutSeconds: 15 * 60,
        description: `${catalog.name}: ${catalog.description} · $${catalog.priceUSDC} USDC`,
        extra: {
          quoteId,
          priceUSDC: catalog.priceUSDC,
          seller: catalog.id,
          retryWith: 'X-PAYMENT: base64(JSON {x402Version:1, scheme:"exact", network, payload:{quoteId, amount, payer, txHash}})',
          ...extra,
        },
      },
    ],
  };
  res.writeHead(402, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body, null, 2));
}

export function verifyPaymentHeader(header, quotes, priceUSDC) {
  let p;
  try {
    p = unb64(header);
  } catch {
    throw new Error('X-PAYMENT is not base64 JSON');
  }
  if (p.x402Version !== 1 || p.scheme !== 'exact' || p.network !== X402_NETWORK) {
    throw new Error('unsupported x402Version/scheme/network');
  }
  const { quoteId, amount, payer, txHash } = p.payload || {};
  if (!quoteId || !quotes.has(quoteId)) throw new Error('unknown quote');
  const quote = quotes.get(quoteId);
  if (quote.used) throw new Error('quote already redeemed');
  if (Date.now() / 1000 > quote.expiresAt) throw new Error('quote expired');
  if (Number(amount) + 1e-12 < priceUSDC) throw new Error('underpaid');
  if (!payer) throw new Error('missing payer');
  if (!txHash) throw new Error('missing txHash');
  quote.used = true;
  quotes.set(quoteId, quote);
  return { quote, payer, amount: Number(amount), txHash };
}

export function createMockSeller(catalog) {
  const quotes = new Map();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const json = (code, o, headers = {}) => {
      res.writeHead(code, { 'content-type': 'application/json', ...headers });
      res.end(JSON.stringify(o, null, 2));
    };
    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        return json(200, { ok: true, id: catalog.id, priceUSDC: catalog.priceUSDC });
      }
      if (req.method === 'GET' && Object.hasOwn(FIXTURES, url.pathname)) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(FIXTURES[url.pathname]);
        return;
      }
      if (url.pathname !== catalog.path) {
        return json(404, { error: `try ${catalog.path}` });
      }
      if (!['GET', 'POST'].includes(req.method)) return json(405, { error: 'GET or POST' });
      const resource = `${url.origin}${url.pathname}`;
      const quoteExtra = catalog.resultType
        ? { resultType: catalog.resultType, result: catalog.resultFor(url) }
        : {};
      const header = req.headers['x-payment'];
      if (!header) return paymentRequired(res, resource, catalog, quotes, undefined, quoteExtra);
      let paid;
      try {
        paid = verifyPaymentHeader(header, quotes, catalog.priceUSDC);
      } catch (e) {
        return paymentRequired(res, resource, catalog, quotes, e.message, quoteExtra);
      }
      const receipt = {
        success: true,
        network: X402_NETWORK,
        payer: paid.payer,
        paidUSDC: catalog.priceUSDC,
        txHash: paid.txHash,
      };
      const payload = catalog.payload.length ? catalog.payload(url) : catalog.payload();
      return json(200, payload, {
        'x-payment-response': b64(receipt),
        'access-control-expose-headers': 'X-PAYMENT-RESPONSE',
      });
    } catch (e) {
      return json(500, { error: e.message });
    }
  });
  return {
    catalog,
    listen(port = 0) {
      return new Promise((resolve, reject) => {
        const onError = (err) => reject(err);
        server.once('error', onError);
        server.listen(port, '127.0.0.1', () => {
          server.removeListener('error', onError);
          const { port: p } = server.address();
          const origin = `http://127.0.0.1:${p}`;
          resolve({
            ...catalog,
            origin,
            url: `${origin}${catalog.path}`,
            badUrl: catalog.resultType ? `${origin}${catalog.path}?delivery=bad` : undefined,
            port: p,
            close: () => new Promise((r) => server.close(r)),
          });
        });
      });
    },
  };
}

export async function startMockSellers(ports = {}) {
  const sellers = [];
  for (const catalog of SELLER_CATALOG) {
    const preferred = Number(ports[catalog.id] || 0);
    try {
      sellers.push(await createMockSeller(catalog).listen(preferred));
    } catch {
      sellers.push(await createMockSeller(catalog).listen(0));
    }
  }
  return {
    sellers,
    byId: Object.fromEntries(sellers.map((s) => [s.id, s])),
    close: () => Promise.all(sellers.map((s) => s.close())),
  };
}

if (process.argv[1] && new URL(import.meta.url).pathname === new URL(`file://${process.argv[1]}`).pathname) {
  const pack = await startMockSellers();
  for (const s of pack.sellers) {
    console.log(`${s.name}  $${s.priceUSDC}  ${s.url}`);
  }
  console.log('mock x402 sellers listening (Ctrl+C to stop)');
}
