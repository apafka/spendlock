// The "machine-verifiable" part. Every lead is checked by rules a computer can run,
// so nobody has to trust the worker. Each rule returns {ok, detail}; the report keeps them all.
// Network calls (DNS, web pages) are passed in as functions so tests can fake them.

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})*\.[a-z]{2,24}$/;
const UA = { 'user-agent': 'Mozilla/5.0 (Spendlock verifier; +https://alanpafka.com)' };

// Real DNS lookup over HTTPS (Cloudflare). True if the domain has an A or MX record.
export async function dohResolves(domain) {
  for (const type of ['A', 'MX']) {
    try {
      const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`, {
        headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000),
      });
      const j = await res.json();
      if (j.Status === 0 && (j.Answer || []).length > 0) return true;
    } catch {}
  }
  return false;
}

// Download a page as lowercase text. Returns null if it could not be loaded
// (blocked, timeout, 4xx/5xx). null means "we don't know", which is NOT the same as "no".
// Tries twice, because a single timeout shouldn't decide anything.
export async function fetchText(url, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000), redirect: 'follow', headers: UA });
      if (res.ok) return (await res.text()).toLowerCase();
    } catch {}
  }
  return null;
}

// Pages on the company's own site where storage work is usually described.
export const SUBPAGES = ['', '/projects', '/storage', '/battery-storage', '/energy-storage', '/en', '/en/projects', '/about'];

export const cleanDomain = (d) => String(d || '').trim().toLowerCase()
  .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

// First meaningful word of the company name, e.g. "Ingrid Capacity" -> "ingrid".
const nameToken = (company) => String(company).toLowerCase().replace(/\(.*?\)/g, '').split(/[^a-z0-9]+/).find((w) => w.length >= 3) || '';
const anyOf = (text, words) => words.find((w) => text.includes(w.toLowerCase()));

/**
 * Check every lead against the job spec.
 * spec.rules (all optional, see NEXT.md):
 *   homepageKeywords: ["battery","storage"]  -> homepage must contain one of them
 *   requireSource: true                       -> lead needs a source_url that loads and names the company
 *   sourceKeywords: ["bess","battery"]        -> that source page must also mention one of these
 *   excludeDomains: ["rwe.com"]               -> e.g. skip giants the buyer already knows
 * Each item gets status: 'pass' (paid), 'fail' (refunded), or 'review' (refunded, listed for a human).
 * @returns {{verified, rejected, needsReview, items}}
 */
export async function verifyLeads(leads, spec, { resolve = dohResolves, getText = fetchText } = {}) {
  const rules = spec.rules || {};
  const allowed = new Set((spec.countries || []).map((c) => c.toUpperCase()));
  const excluded = new Set((rules.excludeDomains || []).map(cleanDomain));
  const seen = new Set();
  const verified = [], rejected = [], needsReview = [], items = [];

  for (const lead of leads) {
    const domain = cleanDomain(lead.domain);
    const checks = [];
    const check = (rule, ok, detail = '') => { checks.push({ rule, ok, detail }); return ok; };

    // Cheap offline checks first; stop at the first failure (saves network calls).
    let ok = check('has_company', !!lead.company, lead.company ? '' : 'missing company name')
      && check('valid_domain', DOMAIN_RE.test(domain), DOMAIN_RE.test(domain) ? domain : `invalid domain "${lead.domain}"`)
      && check('unique', !seen.has(domain), seen.has(domain) ? 'duplicate domain' : '')
      && check('country_allowed', !allowed.size || allowed.has(String(lead.country || '').toUpperCase()),
        `country ${lead.country}${allowed.size && !allowed.has(String(lead.country || '').toUpperCase()) ? ' not allowed' : ''}`)
      && check('not_excluded', !excluded.has(domain), excluded.has(domain) ? 'domain on exclude list' : '');
    if (DOMAIN_RE.test(domain)) seen.add(domain);

    if (ok) {
      const live = await resolve(domain);
      ok = check('dns_resolves', live, live ? 'A/MX record found' : 'domain does not resolve (no A/MX record)');
    }
    // Evidence step. Each source of evidence is "yes", "no", or "unknown" (page blocked).
    // pass   = at least one "yes" and no hard "no" from the source
    // review = nothing said "no", but nothing could confirm it either -> refunded, listed separately
    // fail   = clear negative evidence
    let review = false;
    if (ok && (rules.homepageKeywords?.length || rules.requireSource)) {
      let siteYes = false, siteLoaded = false, srcYes = false, srcNo = '', srcUnknown = false;
      if (rules.homepageKeywords?.length) {
        for (const sub of SUBPAGES) { // homepage first, then likely subpages
          const page = await getText(`https://${domain}${sub}`);
          if (page === null) continue;
          siteLoaded = true;
          const hit = anyOf(page, rules.homepageKeywords);
          if (hit) { siteYes = true; check('site_keyword', true, `${sub || '/'} mentions "${hit}"`); break; }
        }
        if (!siteYes) checks.push({ rule: 'site_keyword', ok: null, detail: siteLoaded ? `no keyword on ${SUBPAGES.length} pages tried` : 'site did not load' });
      }
      if (rules.requireSource) {
        const src = String(lead.source_url || '');
        const page = /^https?:\/\//.test(src) ? await getText(src) : null;
        const token = nameToken(lead.company);
        if (!src) srcNo = 'no source_url';
        else if (page === null) srcUnknown = true;
        else if (!page.includes(token)) srcNo = `source does not mention "${token}"`;
        else if (rules.sourceKeywords?.length && !anyOf(page, rules.sourceKeywords)) srcNo = `source lacks any of: ${rules.sourceKeywords.join(', ')}`;
        else srcYes = true;
        checks.push({ rule: 'source_evidence', ok: srcYes ? true : srcNo ? false : null,
          detail: srcYes ? `source names "${token}" + storage` : srcNo || 'source page blocked/unreachable (inconclusive)' });
      }
      if (srcNo) ok = false;                                     // hard no from the evidence source
      else if (siteYes || srcYes) ok = true;                     // at least one confirmation
      else if (srcUnknown || (rules.homepageKeywords?.length && !siteLoaded)) review = true; // nothing could be checked
      else ok = false;                                           // site loaded, no keyword, and no source to rescue it
      if (!ok && !srcNo) checks.push({ rule: 'evidence', ok: false, detail: 'no storage keyword on site and no confirming source' });
      if (review) checks.push({ rule: 'evidence', ok: null, detail: `could not confirm: ${siteLoaded ? 'no storage keyword on site' : 'site blocked'}${srcUnknown ? ', source page blocked' : ''}` });
    }

    const failed = checks.find((c) => c.ok === false);
    let status = failed ? 'fail' : review ? 'review' : 'pass';
    let reason = failed ? failed.detail : review ? checks[checks.length - 1].detail : 'all checks passed';
    if (status === 'pass' && verified.length >= spec.maxItems) { status = 'fail'; reason = 'over maxItems (not paid)'; } // client only pays for maxItems
    const item = { company: lead.company, domain, country: lead.country, source_url: lead.source_url, status, passed: status === 'pass', reason, checks };
    items.push(item);
    if (status === 'pass') verified.push({ ...lead, domain });
    else if (status === 'review') needsReview.push({ lead, reason });
    else rejected.push({ lead, reason });
  }
  return { verified, rejected, needsReview, items };
}
