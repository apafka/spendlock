// Rules for the "verified Hyperliquid wallets" result type (resultType "hl-wallets/v1").
// A buyer asks e.g. "30 wallets that made >= $10k realized PnL in the last 30 days with >= 20 trades".
// Every claim is re-checked against Hyperliquid's free, public info API, so nobody has to trust the worker.
// The API call is passed in as a function so tests can fake it.

const INFO_URL = process.env.HL_INFO_URL || 'https://api.hyperliquid.xyz/info'; // override = offline tests
const HISTORY_CAP = 10000;
const STABLES = ['USDC', 'USDT0', 'USDE', 'USDH'];
const ADDR_RE = /^0x[0-9a-f]{40}$/;

// Real call to the public info endpoint. Returns parsed JSON, or null if it could not be reached
// (null = "we don't know", which leads to needs-review, never to a fail).
export async function hlInfo(body, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(INFO_URL, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
      if (res.ok) return await res.json();
    } catch {}
  }
  return null;
}

/**
 * spec.rules (all optional):
 *   windowDays: 30            -> look-back window for trades and PnL
 *   minRealizedPnlUsd: 10000  -> sum of closedPnl minus fees in the window
 *   minTrades: 20             -> fills in the window
 *   minAccountValueUsd: 50000 -> current perp account value
 *   claimTolerance: 0.1       -> if the worker states pnl/trades, they must match within 10%
 *   excludeAddresses: [...]   -> wallets the buyer already tracks
 * Status per wallet: 'pass' (paid), 'fail' (refunded), 'review' (API unreachable or 10k history cap hit; refunded, listed).
 */
export async function verifyWallets(wallets, spec, { info = hlInfo, now = Date.now() } = {}) {
  const r = spec.rules || {};
  const windowMs = (r.windowDays || 30) * 86400000;
  const tol = r.claimTolerance ?? 0.1;
  const excluded = new Set((r.excludeAddresses || []).map((a) => a.toLowerCase()));
  const seen = new Set();
  const verified = [], rejected = [], needsReview = [], items = [];
  const close = (claimed, actual) => Math.abs(claimed - actual) <= Math.max(1, Math.abs(actual) * tol);

  for (const w of wallets) {
    const address = String(w.address || '').trim().toLowerCase();
    const checks = [];
    const check = (rule, ok, detail = '') => { checks.push({ rule, ok, detail }); return ok; };
    let review = false;

    let ok = check('valid_address', ADDR_RE.test(address), ADDR_RE.test(address) ? address : `invalid address "${w.address}"`)
      && check('unique', !seen.has(address), seen.has(address) ? 'duplicate address' : '')
      && check('not_excluded', !excluded.has(address), excluded.has(address) ? 'address on exclude list' : '');
    if (ADDR_RE.test(address)) seen.add(address);

    if (ok) {
      // "Unified" accounts keep collateral in spot USDC and show $0 on the perp side, so read both
      // and take the larger (never double-counts; may slightly undercount split accounts).
      const state = r.minAccountValueUsd != null ? await info({ type: 'clearinghouseState', user: address }) : {};
      const spot = r.minAccountValueUsd != null && state !== null ? await info({ type: 'spotClearinghouseState', user: address }) : {};
      // The API returns at most 2000 fills per call, so page forward by time (and only the newest 10,000 exist at all).
      let fills = [], start = now - windowMs;
      for (let page = 0; page < 5; page++) {
        const batch = await info({ type: 'userFillsByTime', user: address, startTime: start, endTime: now, aggregateByTime: true });
        if (batch === null) { fills = null; break; }
        fills.push(...batch);
        if (batch.length < 2000) break;
        start = Math.max(...batch.map((f) => f.time)) + 1;
      }
      if (state === null || spot === null || fills === null) { review = true; checks.push({ rule: 'api', ok: null, detail: 'Hyperliquid API unreachable (inconclusive)' }); }
      else {
        const trades = fills.length;
        // Hyperliquid only keeps a wallet's newest 10,000 fills. At the cap, the window may be cut short,
        // so PnL and trade counts can't be trusted: send to a human instead of paying.
        const capped = trades >= HISTORY_CAP;
        if (capped) { review = true; checks.push({ rule: 'history_cap', ok: null, detail: `hit the ${HISTORY_CAP.toLocaleString('en-US')}-fill API history cap; 30d PnL may be incomplete` }); }
        const pnl = fills.reduce((s, f) => s + Number(f.closedPnl || 0) - Number(f.fee || 0), 0);
        const pnlTxt = `$${Math.round(pnl).toLocaleString('en-US')}`;
        if (r.minAccountValueUsd != null) {
          const stables = (spot?.balances || []).filter((b) => STABLES.includes(b.coin)).reduce((t, b) => t + Number(b.total || 0), 0);
          const av = Math.max(Number(state?.marginSummary?.accountValue || 0), stables);
          ok = check('account_value', av >= r.minAccountValueUsd, `account value $${Math.round(av).toLocaleString('en-US')} (min $${r.minAccountValueUsd})`) && ok;
        }
        if (r.minTrades != null) ok = check('min_trades', trades >= r.minTrades, `${trades} trades in ${r.windowDays || 30}d (min ${r.minTrades})`) && ok;
        if (r.minRealizedPnlUsd != null) ok = check('min_pnl', pnl >= r.minRealizedPnlUsd, `realized PnL ${pnlTxt} (min $${r.minRealizedPnlUsd})`) && ok;
        // The worker's own numbers must be honest, not just good enough.
        if (w.claimed_pnl_usd != null && w.claimed_pnl_usd !== '') ok = check('claim_pnl', close(Number(w.claimed_pnl_usd), pnl), `claimed $${w.claimed_pnl_usd}, actual ${pnlTxt}`) && ok;
        if (w.claimed_trades != null && w.claimed_trades !== '') ok = check('claim_trades', close(Number(w.claimed_trades), trades), `claimed ${w.claimed_trades}, actual ${trades}`) && ok;
      }
    }

    const failed = checks.find((c) => c.ok === false);
    let status = failed ? 'fail' : review ? 'review' : 'pass';
    let reason = failed ? failed.detail : review ? checks.find((c) => c.ok === null).detail : 'all checks passed';
    if (status === 'pass' && verified.length >= spec.maxItems) { status = 'fail'; reason = 'over maxItems (not paid)'; }
    // Same item shape as company leads, so the report and web page work unchanged.
    items.push({ company: w.label || address.slice(0, 10), domain: address, address, status, passed: status === 'pass', reason, checks });
    if (status === 'pass') verified.push({ ...w, address });
    else if (status === 'review') needsReview.push({ lead: w, reason });
    else rejected.push({ lead: w, reason });
  }
  return { verified, rejected, needsReview, items };
}
