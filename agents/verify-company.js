// Deterministic company-record verifier.
// Offline (default): fetch the result's evidenceUrl (a local fixture page in CI).
// Live (opt-in): resolve the domain and fetch its homepage. Never used by default tests.
// Same spec + same page bytes → same pass/fail. No LLM.

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})*\.[a-z]{2,24}$/;

export const COMPANY_RECORD_TYPE = 'company-record/v1';

export function cleanDomain(d) {
  return String(d || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

export function htmlToText(html) {
  const raw = String(html || '');
  const title = ((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '')
    .replace(/\s+/g, ' ')
    .trim();
  const text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { title, text };
}

export function pageMatchesCompany(html, name) {
  const needle = String(name || '').trim().toLowerCase();
  if (!needle) return { ok: false, detail: 'missing company name' };
  const { title, text } = htmlToText(html);
  if (title.toLowerCase().includes(needle)) {
    return { ok: true, detail: `title mentions "${name}"` };
  }
  if (text.toLowerCase().includes(needle)) {
    return { ok: true, detail: `page mentions "${name}"` };
  }
  return { ok: false, detail: `title or content does not mention "${name}"` };
}

export async function fetchPage(url, { timeoutMs = 8000 } = {}) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
      headers: { 'user-agent': 'Spendlock verifier (local/testnet)' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function dnsResolves(domain) {
  for (const type of ['A', 'AAAA']) {
    try {
      const res = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
        { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000) },
      );
      const j = await res.json();
      if (j.Status === 0 && (j.Answer || []).length > 0) return true;
    } catch {
      // try the other record type
    }
  }
  return false;
}

function check(checks, rule, ok, detail = '') {
  checks.push({ rule, ok, detail });
  return ok;
}

/**
 * Verify one machine-checkable company record: name, domain, and a claim that
 * the domain serves a page whose title or content matches the company name.
 *
 * @param {{ name?: string, domain?: string, claim?: string, evidenceUrl?: string }} record
 * @param {{ live?: boolean, fetchPage?: Function, resolve?: Function }} [opts]
 */
export async function verifyCompanyRecord(record, opts = {}) {
  const live = Boolean(opts.live);
  const getPage = opts.fetchPage || fetchPage;
  const resolve = opts.resolve || dnsResolves;
  const checks = [];
  const name = String(record?.name || '').trim();
  const domain = cleanDomain(record?.domain);

  if (!check(checks, 'has_name', Boolean(name), name || 'missing company name')) {
    return fail(checks, 'missing company name', record);
  }
  if (!check(checks, 'has_domain', Boolean(domain), domain || 'missing domain')) {
    return fail(checks, 'missing domain', record);
  }
  if (!check(checks, 'valid_domain', DOMAIN_RE.test(domain), DOMAIN_RE.test(domain) ? domain : `invalid domain "${record?.domain}"`)) {
    return fail(checks, checks.at(-1).detail, record);
  }

  let evidenceUrl = String(record?.evidenceUrl || '').trim();
  if (live) {
    const dns = await resolve(domain);
    if (!check(checks, 'dns_resolves', dns, dns ? 'A/AAAA record found' : 'domain does not resolve')) {
      return fail(checks, 'domain does not resolve', record);
    }
    if (!evidenceUrl) evidenceUrl = `https://${domain}/`;
  }
  if (!check(checks, 'has_evidence', Boolean(evidenceUrl), evidenceUrl || 'offline verifier needs evidenceUrl (local fixture)')) {
    return fail(checks, 'offline verifier needs evidenceUrl (local fixture)', record);
  }

  const html = await getPage(evidenceUrl);
  if (!check(checks, 'page_loads', html != null, html != null ? evidenceUrl : `could not load ${evidenceUrl}`)) {
    return fail(checks, `could not load ${evidenceUrl}`, record);
  }

  const match = pageMatchesCompany(html, name);
  check(checks, 'name_on_page', match.ok, match.detail);
  if (!match.ok) return fail(checks, match.detail, record);

  return {
    ok: true,
    verified: true,
    reason: 'all checks passed',
    checks,
    record: { name, domain, claim: record?.claim || '', evidenceUrl },
  };
}

function fail(checks, reason, record) {
  return {
    ok: false,
    verified: false,
    reason,
    checks,
    record: record || null,
  };
}
