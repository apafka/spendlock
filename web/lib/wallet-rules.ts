// Port of market/agents/walletRules.js for the browser. Same rules, same item shape.
// The API call is passed in so tests and the recorded-fixture path can fake it.

import { hlInfo, type HlFill, type HlClearing, type HlSpot, type InfoFn } from "./hl-info";

const HISTORY_CAP = 10_000;
const STABLES = ["USDC", "USDT0", "USDE", "USDH"];
const ADDR_RE = /^0x[0-9a-f]{40}$/;

export type WalletCandidate = {
  address: string;
  label?: string;
  claimed_pnl_usd?: number | string;
  claimed_trades?: number | string;
};

export type WalletSpec = {
  maxItems: number;
  rules?: {
    windowDays?: number;
    minRealizedPnlUsd?: number;
    minTrades?: number;
    minAccountValueUsd?: number;
    claimTolerance?: number;
    excludeAddresses?: string[];
  };
};

export type RuleCheck = { rule: string; ok: boolean | null; detail: string };

export type WalletItem = {
  company: string;
  domain: string;
  address: string;
  status: "pass" | "fail" | "review";
  passed: boolean;
  reason: string;
  checks: RuleCheck[];
};

export type VerifyResult = {
  verified: WalletCandidate[];
  rejected: { lead: WalletCandidate; reason: string }[];
  needsReview: { lead: WalletCandidate; reason: string }[];
  items: WalletItem[];
};

export { hlInfo };
export type { InfoFn };

/**
 * spec.rules (all optional):
 *   windowDays, minRealizedPnlUsd, minTrades, minAccountValueUsd, claimTolerance, excludeAddresses
 * Status per wallet: pass (paid), fail (refunded), review (API unreachable or history cap; refunded).
 */
export async function verifyWallets(
  wallets: WalletCandidate[],
  spec: WalletSpec,
  {
    info = hlInfo,
    now = Date.now(),
    onItem,
    onStart,
  }: {
    info?: InfoFn;
    now?: number;
    onItem?: (item: WalletItem, index: number, total: number) => void;
    onStart?: (wallet: WalletCandidate, index: number, total: number) => void;
  } = {},
): Promise<VerifyResult> {
  const r = spec.rules || {};
  const windowMs = (r.windowDays || 30) * 86_400_000;
  const tol = r.claimTolerance ?? 0.1;
  const excluded = new Set((r.excludeAddresses || []).map((a) => a.toLowerCase()));
  const seen = new Set<string>();
  const verified: WalletCandidate[] = [];
  const rejected: { lead: WalletCandidate; reason: string }[] = [];
  const needsReview: { lead: WalletCandidate; reason: string }[] = [];
  const items: WalletItem[] = [];
  const close = (claimed: number, actual: number) =>
    Math.abs(claimed - actual) <= Math.max(1, Math.abs(actual) * tol);

  for (const [index, w] of wallets.entries()) {
    onStart?.(w, index, wallets.length);
    const address = String(w.address || "").trim().toLowerCase();
    const checks: RuleCheck[] = [];
    const check = (rule: string, ok: boolean, detail = "") => {
      checks.push({ rule, ok, detail });
      return ok;
    };
    let review = false;

    let ok =
      check("valid_address", ADDR_RE.test(address), ADDR_RE.test(address) ? address : `invalid address "${w.address}"`) &&
      check("unique", !seen.has(address), seen.has(address) ? "duplicate address" : "") &&
      check("not_excluded", !excluded.has(address), excluded.has(address) ? "address on exclude list" : "");
    if (ADDR_RE.test(address)) seen.add(address);

    if (ok) {
      const state =
        r.minAccountValueUsd != null ? ((await info({ type: "clearinghouseState", user: address })) as HlClearing | null) : {};
      const spot =
        r.minAccountValueUsd != null && state !== null
          ? ((await info({ type: "spotClearinghouseState", user: address })) as HlSpot | null)
          : {};
      let fills: HlFill[] | null = [];
      let start = now - windowMs;
      for (let page = 0; page < 5; page++) {
        const batch = (await info({
          type: "userFillsByTime",
          user: address,
          startTime: start,
          endTime: now,
          aggregateByTime: true,
        })) as HlFill[] | null;
        if (batch === null) {
          fills = null;
          break;
        }
        fills.push(...batch);
        if (batch.length < 2000) break;
        start = Math.max(...batch.map((f) => Number(f.time) || 0)) + 1;
      }
      if (state === null || spot === null || fills === null) {
        review = true;
        checks.push({ rule: "api", ok: null, detail: "Hyperliquid API unreachable (inconclusive)" });
      } else {
        const trades = fills.length;
        const capped = trades >= HISTORY_CAP;
        if (capped) {
          review = true;
          checks.push({
            rule: "history_cap",
            ok: null,
            detail: `hit the ${HISTORY_CAP.toLocaleString("en-US")}-fill API history cap; 30d PnL may be incomplete`,
          });
        }
        const pnl = fills.reduce((s, f) => s + Number(f.closedPnl || 0) - Number(f.fee || 0), 0);
        const pnlTxt = `$${Math.round(pnl).toLocaleString("en-US")}`;
        if (r.minAccountValueUsd != null) {
          const stables = (spot?.balances || [])
            .filter((b) => STABLES.includes(b.coin))
            .reduce((t, b) => t + Number(b.total || 0), 0);
          const av = Math.max(Number(state?.marginSummary?.accountValue || 0), stables);
          ok =
            check(
              "account_value",
              av >= r.minAccountValueUsd,
              `account value $${Math.round(av).toLocaleString("en-US")} (min $${r.minAccountValueUsd})`,
            ) && ok;
        }
        if (r.minTrades != null) {
          ok =
            check("min_trades", trades >= r.minTrades, `${trades} trades in ${r.windowDays || 30}d (min ${r.minTrades})`) &&
            ok;
        }
        if (r.minRealizedPnlUsd != null) {
          ok = check("min_pnl", pnl >= r.minRealizedPnlUsd, `realized PnL ${pnlTxt} (min $${r.minRealizedPnlUsd})`) && ok;
        }
        if (w.claimed_pnl_usd != null && w.claimed_pnl_usd !== "") {
          ok =
            check("claim_pnl", close(Number(w.claimed_pnl_usd), pnl), `claimed $${w.claimed_pnl_usd}, actual ${pnlTxt}`) &&
            ok;
        }
        if (w.claimed_trades != null && w.claimed_trades !== "") {
          ok =
            check(
              "claim_trades",
              close(Number(w.claimed_trades), trades),
              `claimed ${w.claimed_trades}, actual ${trades}`,
            ) && ok;
        }
      }
    }

    const failed = checks.find((c) => c.ok === false);
    let status: WalletItem["status"] = failed ? "fail" : review ? "review" : "pass";
    let reason = failed ? failed.detail : review ? (checks.find((c) => c.ok === null)?.detail ?? "needs review") : "all checks passed";
    if (status === "pass" && verified.length >= spec.maxItems) {
      status = "fail";
      reason = "over maxItems (not paid)";
    }
    const item: WalletItem = {
      company: w.label || address.slice(0, 10),
      domain: address,
      address,
      status,
      passed: status === "pass",
      reason,
      checks,
    };
    items.push(item);
    if (status === "pass") verified.push({ ...w, address });
    else if (status === "review") needsReview.push({ lead: w, reason });
    else rejected.push({ lead: w, reason });
    onItem?.(item, index, wallets.length);
  }
  return { verified, rejected, needsReview, items };
}
