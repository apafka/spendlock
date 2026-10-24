// Verified company record: deterministic check, then pay only if it passes.
// Offline fixtures only. Run: node --test verified.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createTeam } from './profiles.js';
import { startMockSellers } from './mock-sellers.js';
import { approvePay, spendlockBuyVerified, spendlockPay } from './pay.js';
import {
  COMPANY_RECORD_TYPE,
  pageMatchesCompany,
  verifyCompanyRecord,
} from './verify-company.js';

function team(approvalRule = 50) {
  const t = createTeam({ seed: false, mode: 'simulated', dataDir: mkdtempSync(join(tmpdir(), 'spendlock-v-')) });
  t.upsert({
    id: 'scout',
    name: 'Scout',
    perTxUSDC: 5,
    dailyUSDC: 50,
    budgetUSDC: 100,
    approvalRule,
  });
  return t;
}

const GOOD_HTML = '<html><head><title>Acme Tools</title></head><body>Acme Tools builds widgets.</body></html>';
const BAD_HTML = '<html><head><title>Unrelated Inc</title></head><body>Something else.</body></html>';

test('page match is deterministic: title or body must contain the company name', () => {
  assert.equal(pageMatchesCompany(GOOD_HTML, 'Acme Tools').ok, true);
  assert.equal(pageMatchesCompany(BAD_HTML, 'Acme Tools').ok, false);
  assert.match(pageMatchesCompany(BAD_HTML, 'Acme Tools').detail, /does not mention/);
});

test('verifyCompanyRecord: offline fixture pass / fail / missing fields (injected fetch)', async () => {
  const pages = {
    'http://fixture.test/acme': GOOD_HTML,
    'http://fixture.test/wrong': BAD_HTML,
  };
  const fetchPage = async (url) => pages[url] ?? null;

  const pass = await verifyCompanyRecord({
    name: 'Acme Tools',
    domain: 'acme.example',
    claim: 'page matches name',
    evidenceUrl: 'http://fixture.test/acme',
  }, { fetchPage });
  assert.equal(pass.ok, true);
  assert.equal(pass.verified, true);

  const fail = await verifyCompanyRecord({
    name: 'Acme Tools',
    domain: 'acme.example',
    evidenceUrl: 'http://fixture.test/wrong',
  }, { fetchPage });
  assert.equal(fail.ok, false);
  assert.match(fail.reason, /does not mention/);

  const missing = await verifyCompanyRecord({ domain: 'acme.example' }, { fetchPage });
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /missing company name/);

  const noEvidence = await verifyCompanyRecord({ name: 'Acme Tools', domain: 'acme.example' }, { fetchPage });
  assert.equal(noEvidence.ok, false);
  assert.match(noEvidence.reason, /evidenceUrl/);
});

test('live mode: DNS miss is not paid; DNS+page hit passes (both injected)', async () => {
  const fetchPage = async () => GOOD_HTML;
  const dead = await verifyCompanyRecord({
    name: 'Acme Tools',
    domain: 'acme.example',
  }, { live: true, fetchPage, resolve: async () => false });
  assert.equal(dead.ok, false);
  assert.match(dead.reason, /does not resolve/);

  const live = await verifyCompanyRecord({
    name: 'Acme Tools',
    domain: 'acme.example',
  }, { live: true, fetchPage, resolve: async () => true });
  assert.equal(live.ok, true);
  assert.equal(live.record.evidenceUrl, 'https://acme.example/');
});

test('good company record is paid+verified; bad delivery is rejected and not paid', async () => {
  const t = team(0.1);
  const pack = await startMockSellers();
  try {
    const seller = pack.byId['verified-company'];
    assert.equal(seller.priceUSDC, 0.08);
    assert.equal(seller.resultType, COMPANY_RECORD_TYPE);

    const paid = await spendlockBuyVerified(t, { agent: 'scout', url: seller.url });
    assert.equal(paid.outcome, 'paid');
    assert.equal(paid.verified, true);
    assert.equal(paid.paid, true);
    assert.equal(paid.amountUSDC, 0.08);
    assert.equal(paid.data.name, 'Acme Tools');
    assert.equal(t.findAgent('scout').spentTotalUSDC, 0.08);

    const failed = await spendlockBuyVerified(t, { agent: 'scout', url: seller.badUrl });
    assert.equal(failed.outcome, 'rejected');
    assert.equal(failed.verified, false);
    assert.equal(failed.paid, false);
    assert.equal(failed.reason, 'verification failed, not paid');
    assert.equal(t.findAgent('scout').spentTotalUSDC, 0.08);
    assert.equal(t.log()[0].outcome, 'rejected');
  } finally {
    await pack.close();
  }
});

test('spendlock_pay cannot bypass the verifier on a company-record seller', async () => {
  const t = team(0.1);
  const pack = await startMockSellers();
  try {
    const failed = await spendlockPay(t, { agent: 'scout', url: pack.byId['verified-company'].badUrl });
    assert.equal(failed.outcome, 'rejected');
    assert.equal(failed.paid, false);
    assert.equal(t.findAgent('scout').spentTotalUSDC, 0);
  } finally {
    await pack.close();
  }
});

test('verified buy is blocked by the per-tx cap before any check', async () => {
  const t = createTeam({ seed: false, mode: 'simulated', dataDir: mkdtempSync(join(tmpdir(), 'spendlock-v-')) });
  t.upsert({
    id: 'scout',
    name: 'Scout',
    perTxUSDC: 0.05,
    dailyUSDC: 50,
    budgetUSDC: 100,
    approvalRule: 50,
  });
  const pack = await startMockSellers();
  try {
    const blocked = await spendlockBuyVerified(t, { agent: 'scout', url: pack.byId['verified-company'].url });
    assert.equal(blocked.outcome, 'blocked');
    assert.equal(blocked.reason, 'over per-tx cap');
    assert.equal(t.findAgent('scout').spentTotalUSDC, 0);
  } finally {
    await pack.close();
  }
});

test('verified buy above the approval rule waits; owner approve still verifies', async () => {
  const t = team('every');
  const pack = await startMockSellers();
  try {
    const pending = await spendlockBuyVerified(t, { agent: 'scout', url: pack.byId['verified-company'].url });
    assert.equal(pending.outcome, 'pending');
    assert.equal(t.findAgent('scout').spentTotalUSDC, 0);

    const paid = await approvePay(t, pending.requestId);
    assert.equal(paid.outcome, 'paid');
    assert.equal(paid.verified, true);
    assert.equal(t.findAgent('scout').spentTotalUSDC, 0.08);

    const again = await spendlockBuyVerified(t, { agent: 'scout', url: pack.byId['verified-company'].badUrl });
    assert.equal(again.outcome, 'pending');
    const rejected = await approvePay(t, again.requestId);
    assert.equal(rejected.outcome, 'rejected');
    assert.equal(rejected.reason, 'verification failed, not paid');
    assert.equal(t.findAgent('scout').spentTotalUSDC, 0.08);
  } finally {
    await pack.close();
  }
});

test('spendlock_buy_verified refuses a non-verifiable seller', async () => {
  const t = team();
  const pack = await startMockSellers();
  try {
    const blocked = await spendlockBuyVerified(t, { agent: 'scout', url: pack.byId['price-feed'].url });
    assert.equal(blocked.outcome, 'blocked');
    assert.equal(blocked.reason, 'seller is not a verifiable result');
    assert.equal(t.findAgent('scout').spentTotalUSDC, 0);
  } finally {
    await pack.close();
  }
});

test('MCP spendlock_buy_verified: paid+verified and rejected+not paid', { timeout: 30000 }, async () => {
  const pack = await startMockSellers();
  const dataDir = mkdtempSync(join(tmpdir(), 'spendlock-mcp-v-'));
  const mcp = new Client({ name: 't', version: '0' });
  try {
    await mcp.connect(new StdioClientTransport({
      command: 'node',
      args: [join(import.meta.dirname, 'spendlock-mcp.js')],
      env: { ...process.env, SPENDLOCK_MODE: 'simulated', SPENDLOCK_DATA_DIR: dataDir },
    }));
    const call = async (name, args = {}) => JSON.parse((await mcp.callTool({ name, arguments: args })).content[0].text);
    const seller = pack.byId['verified-company'];

    const paid = await call('spendlock_buy_verified', { agent: 'scout', url: seller.url });
    assert.equal(paid.outcome, 'paid');
    assert.equal(paid.verified, true);

    const failed = await call('spendlock_buy_verified', { agent: 'scout', url: seller.badUrl });
    assert.equal(failed.outcome, 'rejected');
    assert.equal(failed.paid, false);
    assert.equal(failed.reason, 'verification failed, not paid');

    const status = await call('spendlock_status', { agent: 'scout' });
    assert.equal(status.agent.spentTodayUSDC, 0.08);
  } finally {
    await mcp.close();
    await pack.close();
  }
});
