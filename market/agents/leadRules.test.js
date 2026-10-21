// Run: node --test   (offline: fake DNS + fake web pages, so results never change)
import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyLeads } from './leadRules.js';

const fakeDns = async (d) => ['good.ee', 'good.de', 'good.com', 'bess.fi', 'solar.fi'].includes(d);
const pages = {
  'https://bess.fi': '<h1>we build battery storage</h1>',
  'https://solar.fi': '<h1>we build solar parks</h1>',
  'https://news.example/bess': 'acme energy signed a 100 mw bess deal',
  'https://news.example/other': 'some other company built a bess',
};
const fakeText = async (url) => (pages[url] || '').toLowerCase();
const spec = { countries: ['EE', 'DE', 'FI'], maxItems: 10 };

test('accepts good leads and rejects bad ones with reasons', async () => {
  const leads = [
    { company: 'A', domain: 'https://www.good.ee/', country: 'EE' },
    { company: 'B', domain: 'good.de', country: 'de' },
    { company: 'Dup', domain: 'good.ee', country: 'EE' },
    { company: 'US', domain: 'good.com', country: 'US' },
    { company: 'Dead', domain: 'nothing-here.ee', country: 'EE' },
    { company: 'Bad', domain: 'not a domain', country: 'EE' },
    { company: '', domain: 'x.ee', country: 'EE' },
  ];
  const { verified, rejected, items } = await verifyLeads(leads, spec, { resolve: fakeDns });
  assert.deepEqual(verified.map((v) => v.domain), ['good.ee', 'good.de']);
  assert.deepEqual(rejected.map((r) => r.reason), [
    'duplicate domain', 'country US not allowed', 'domain does not resolve (no A/MX record)', 'invalid domain "not a domain"', 'missing company name',
  ]);
  assert.equal(items.length, 7);
  assert.equal(items[0].checks.find((c) => c.rule === 'dns_resolves').ok, true);
});

test('never pays more than maxItems', async () => {
  const leads = [{ company: 'A', domain: 'good.ee', country: 'EE' }, { company: 'B', domain: 'good.de', country: 'DE' }];
  const { verified, items } = await verifyLeads(leads, { ...spec, maxItems: 1 }, { resolve: fakeDns });
  assert.equal(verified.length, 1);
  assert.equal(items[1].reason, 'over maxItems (not paid)');
});

const fakeText2 = async (url) => (url in pages ? pages[url] : null); // missing = blocked
pages['https://solar.fi/projects'] = 'our projects: solar';
pages['https://good.ee'] = 'welcome';
Object.assign(pages, { 'https://sub.fi': 'welcome home', 'https://sub.fi/projects': 'our 50 mw battery storage park' });
const dns2 = async (d) => (await fakeDns(d)) || d === 'sub.fi';

test('site keyword: homepage, then subpages', async () => {
  const leads = [
    { company: 'Bess Co', domain: 'bess.fi', country: 'FI' },
    { company: 'Sub Co', domain: 'sub.fi', country: 'FI' },
    { company: 'Solar Co', domain: 'solar.fi', country: 'FI' },
  ];
  const r = await verifyLeads(leads, { ...spec, rules: { homepageKeywords: ['battery', 'bess'] } }, { resolve: dns2, getText: fakeText2 });
  assert.deepEqual(r.items.map((i) => i.status), ['pass', 'pass', 'fail']);
  assert.match(r.items[1].checks.find((c) => c.rule === 'site_keyword').detail, /\/projects/);
});

test('source rules: names company + BESS; blocked source is review, not fail', async () => {
  const rules = { homepageKeywords: ['battery'], requireSource: true, sourceKeywords: ['bess'] };
  const leads = [
    { company: 'Acme Energy', domain: 'solar.fi', country: 'FI', source_url: 'https://news.example/bess' }, // site no, source yes -> pass
    { company: 'Other Co', domain: 'bess.fi', country: 'FI', source_url: 'https://news.example/bess' },     // source names someone else -> fail
    { company: 'NoSrc', domain: 'bess.fi', country: 'FI' },                                                  // no source -> fail
    { company: 'Blocked', domain: 'good.ee', country: 'EE', source_url: 'https://blocked.example/x' },      // site no keyword, source blocked -> review
    { company: 'Sub Co', domain: 'sub.fi', country: 'FI', source_url: 'https://blocked.example/y' },        // source blocked but site subpage yes -> pass
  ];
  const r = await verifyLeads(leads, { ...spec, rules }, { resolve: dns2, getText: fakeText2 });
  assert.deepEqual(r.items.map((i) => i.status), ['pass', 'fail', 'fail', 'review', 'pass']);
  assert.equal(r.items[1].reason, 'source does not mention "other"');
  assert.equal(r.needsReview.length, 1);
  assert.equal(r.verified.length, 2);
});

test('exclude list', async () => {
  const r = await verifyLeads([{ company: 'Big', domain: 'good.de', country: 'DE' }], { ...spec, rules: { excludeDomains: ['good.de'] } }, { resolve: fakeDns });
  assert.equal(r.rejected[0].reason, 'domain on exclude list');
});
