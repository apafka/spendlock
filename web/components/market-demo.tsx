"use client";

import Link from "next/link";
import { FormEvent, useMemo, useRef, useState } from "react";
import { SpendlockMark } from "@/components/mark";
import { formatUsd, shortAddress } from "@/lib/engine";
import { probeHyperliquid } from "@/lib/hl-info";
import {
  applySettlement,
  blockedLine,
  checkJobFunding,
  fundJob,
  limitingCapLine,
  planJob,
  settleJob,
  type CapCheck,
  type Settlement,
} from "@/lib/market-engine";
import {
  createMarketVault,
  FEE_BPS,
  JOB_SPEC,
  JOB_TITLE,
  MAX_JOB_BUDGET_CENTS,
  MAX_WALLETS,
  pickCandidates,
  PRICE_CENTS,
  recordedInfo,
  RECORDED_AT,
  type MarketVault,
} from "@/lib/market-seed";
import { verifyWallets, type WalletItem } from "@/lib/wallet-rules";

type StepStatus = "idle" | "active" | "done" | "blocked";
type StepId = "post" | "cap" | "fund" | "deliver" | "verify" | "settle";
type VerifyMode = "live" | "recorded";

type Step = {
  id: StepId;
  title: string;
  status: StepStatus;
  detail: string;
};

type Receipt = {
  jobId: number;
  lockCents: number;
  settlement: Settlement;
  fingerprint: string;
  capLine: string;
  mode: VerifyMode;
  modeReason?: string;
  vaultAfter: MarketVault;
};

const STEP_META: { id: StepId; title: string }[] = [
  { id: "post", title: "Job posted" },
  { id: "cap", title: "Spendlock checks the cap" },
  { id: "fund", title: "Escrow funded from the vault" },
  { id: "deliver", title: "Worker delivers candidate wallets" },
  { id: "verify", title: "Each wallet checked on Hyperliquid" },
  { id: "settle", title: "Pay verified, refund the rest" },
];

function idleSteps(): Step[] {
  return STEP_META.map((item) => ({ ...item, status: "idle", detail: "" }));
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fingerprintOf(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex.slice(0, 16)}`;
}

export function MarketDemo() {
  const [count, setCount] = useState(4);
  const [budget, setBudget] = useState("12.00");
  const [budgetTouched, setBudgetTouched] = useState(false);
  const [vault, setVault] = useState<MarketVault>(createMarketVault);
  const [steps, setSteps] = useState<Step[]>(idleSteps);
  const [items, setItems] = useState<WalletItem[]>([]);
  const [checking, setChecking] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<VerifyMode | null>(null);
  const [modeReason, setModeReason] = useState<string | undefined>();
  const [note, setNote] = useState("");
  const runId = useRef(0);

  const preview = useMemo(() => {
    const dollars = Number.parseFloat(budget);
    const cents = Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
    return planJob(count, cents);
  }, [budget, count]);

  function patchSteps(id: StepId, status: StepStatus, detail: string) {
    setSteps((current) => current.map((step) => (step.id === id ? { ...step, status, detail } : step)));
  }

  function changeCount(next: number) {
    setCount(next);
    if (!budgetTouched) setBudget(((next * PRICE_CENTS) / 100).toFixed(2));
  }

  function resetAll() {
    runId.current += 1;
    setVault(createMarketVault());
    setSteps(idleSteps());
    setItems([]);
    setChecking(null);
    setReceipt(null);
    setBlocked(null);
    setRunning(false);
    setMode(null);
    setModeReason(undefined);
    setNote("");
  }

  async function runJob(event?: FormEvent, preset?: { count: number; budget: string }) {
    event?.preventDefault();
    if (running) return;
    const nextCount = preset?.count ?? count;
    const nextBudget = preset?.budget ?? budget;
    if (preset) {
      setCount(preset.count);
      setBudget(preset.budget);
      setBudgetTouched(true);
    }
    const dollars = Number.parseFloat(nextBudget);
    const budgetCents = Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
    const plan = planJob(nextCount, budgetCents);
    const id = (runId.current += 1);
    const alive = () => runId.current === id;

    setRunning(true);
    setReceipt(null);
    setBlocked(null);
    setItems([]);
    setChecking(null);
    setMode(null);
    setModeReason(undefined);
    setSteps(idleSteps());
    setNote(plan.ok ? plan.note : plan.reason);

    patchSteps("post", "active", "Buyer agent writing the job spec…");
    await wait(450);
    if (!alive()) return;

    if (!plan.ok) {
      patchSteps("post", "blocked", plan.reason);
      setBlocked(plan.reason);
      setRunning(false);
      return;
    }

    const spec = {
      title: JOB_TITLE,
      resultType: "hl-wallets/v1",
      maxItems: plan.count,
      pricePerItemUSDC: PRICE_CENTS / 100,
      rules: JOB_SPEC.rules,
      note: "Simulated escrow. Play USDC only.",
    };
    const specHash = await fingerprintOf(spec);
    patchSteps(
      "post",
      "done",
      `${JOB_TITLE}. ${plan.count} wallets × ${formatUsd(PRICE_CENTS)} = ${formatUsd(plan.lockCents)} if Spendlock says yes. Spec fingerprint ${specHash}… (simulated).`,
    );

    patchSteps("cap", "active", "Agent A may only pay ResultEscrow, and only inside its caps.");
    await wait(500);
    if (!alive()) return;

    const check = checkJobFunding(vault, plan.lockCents);
    if (!check.ok) {
      const line = blockedLine(check as Extract<CapCheck, { ok: false }>);
      patchSteps("cap", "blocked", line);
      setBlocked(line);
      setRunning(false);
      return;
    }
    patchSteps(
      "cap",
      "done",
      `${formatUsd(plan.lockCents)} is within Agent A's ${formatUsd(vault.agent.perTxCents)} per-tx cap, ` +
        `${formatUsd(vault.agent.dailyLimitCents)} daily limit, ${formatUsd(vault.agent.totalBudgetCents)} lifetime budget, ` +
        `and the ${formatUsd(MAX_JOB_BUDGET_CENTS)} escrow job cap.`,
    );

    patchSteps("fund", "active", "Vault pulls play USDC into ResultEscrow. Refunds will return here.");
    await wait(550);
    if (!alive()) return;
    const funded = fundJob(vault, plan.lockCents);
    setVault(funded);
    patchSteps(
      "fund",
      "done",
      `Job #${funded.jobCount} funded. Vault ${formatUsd(vault.vaultCents)} → ${formatUsd(funded.vaultCents)}. Escrow holds ${formatUsd(plan.lockCents)}.`,
    );

    patchSteps("deliver", "active", "Worker picking candidates from a recorded Hyperliquid leaderboard snapshot…");
    await wait(700);
    if (!alive()) return;
    const candidates = pickCandidates(plan.count);
    const resultHash = await fingerprintOf(candidates);
    patchSteps(
      "deliver",
      "done",
      `${candidates.length} candidates submitted (fingerprint ${resultHash}…, simulated — not on chain). ` +
        (plan.count >= 2
          ? "Includes one empty account so you can see an unverified item refunded."
          : ""),
    );

    patchSteps("verify", "active", "Probing Hyperliquid's public info API from this browser…");
    const probe = await probeHyperliquid();
    if (!alive()) return;
    const verifyMode: VerifyMode = probe.mode;
    const reason = probe.mode === "recorded" ? probe.reason : undefined;
    setMode(verifyMode);
    setModeReason(reason);
    const info = verifyMode === "live" ? undefined : recordedInfo();
    const walletSpec = { ...JOB_SPEC, maxItems: plan.count };
    const now = verifyMode === "recorded" ? Date.parse(RECORDED_AT) : Date.now();

    const verified = await verifyWallets(candidates, walletSpec, {
      info,
      now,
      onStart: (wallet) => {
        if (!alive()) return;
        setChecking(String(wallet.address || "").trim().toLowerCase());
      },
      onItem: (item) => {
        if (!alive()) return;
        setItems((current) => {
          const next = current.filter((row) => row.address !== item.address);
          next.push(item);
          return next;
        });
      },
    });
    if (!alive()) return;
    setChecking(null);
    setItems(verified.items);
    const passed = verified.items.filter((item) => item.status === "pass").length;
    const failed = verified.items.filter((item) => item.status === "fail").length;
    const review = verified.items.filter((item) => item.status === "review").length;
    patchSteps(
      "verify",
      "done",
      `${passed} pass · ${failed} fail · ${review} review. ` +
        (verifyMode === "live"
          ? "Checked live against api.hyperliquid.xyz/info from this browser."
          : `Recorded snapshot (${RECORDED_AT}). ${reason}.`),
    );

    patchSteps("settle", "active", "ResultEscrow pays per pass, 2% fee, refunds the rest to the vault.");
    await wait(500);
    if (!alive()) return;
    const settlement = settleJob(plan.count, passed);
    const settledVault = applySettlement(funded, settlement);
    setVault(settledVault);
    const reportHash = await fingerprintOf(verified.items);
    const built: Receipt = {
      jobId: funded.jobCount,
      lockCents: plan.lockCents,
      settlement,
      fingerprint: reportHash,
      capLine: limitingCapLine(funded, plan.lockCents),
      mode: verifyMode,
      modeReason: reason,
      vaultAfter: settledVault,
    };
    setReceipt(built);
    patchSteps(
      "settle",
      "done",
      `Worker ${formatUsd(settlement.toWorkerCents)} · fee ${formatUsd(settlement.feeCents)} · refund to vault ${formatUsd(settlement.refundCents)}.`,
    );
    setRunning(false);
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-rule bg-paper/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <SpendlockMark />
            <span className="font-serif text-xl tracking-tight">Spendlock</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/demo" className="text-muted underline-offset-4 hover:text-ink hover:underline">
              Owner dashboard
            </Link>
            <button
              type="button"
              onClick={resetAll}
              className="text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Reset
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 py-6 sm:px-8">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-muted">
            No-wallet market demo · simulated USDC
          </p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight text-ink">
            Pay per verified Hyperliquid wallet
          </h1>
          <p className="mt-2 max-w-3xl text-[16px] leading-7 text-muted">
            Set a budget and a wallet count, then watch one job: posted, funded from a capped Spendlock
            vault, delivered, checked against Hyperliquid&apos;s public info API, and settled. Only
            wallets that pass are paid. The rest goes back to the vault. No wallet, no keys, no chain.
          </p>
        </div>

        <HonestyBanner mode={mode} reason={modeReason} blocked={Boolean(blocked)} />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)]">
          <div className="flex flex-col gap-6">
            <section className="rounded-2xl border border-rule bg-card p-6 sm:p-8">
              <h2 className="font-serif text-2xl">Run a job</h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                {formatUsd(PRICE_CENTS)} per verified wallet. Escrow job cap {formatUsd(MAX_JOB_BUDGET_CENTS)}.
                Agent A&apos;s Spendlock per-tx cap is {formatUsd(vault.agent.perTxCents)}.
              </p>

              <form onSubmit={(event) => runJob(event)} className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-muted">Wallet count</span>
                  <input
                    required
                    type="number"
                    min={1}
                    max={MAX_WALLETS}
                    value={count}
                    onChange={(e) => changeCount(Number(e.target.value) || 1)}
                    className="h-10 rounded-lg px-3"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-muted">Budget (USD)</span>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={budget}
                    onChange={(e) => {
                      setBudgetTouched(true);
                      setBudget(e.target.value);
                    }}
                    className="h-10 rounded-lg px-3"
                  />
                </label>
                <p className="sm:col-span-2 text-sm text-muted">
                  {preview.ok ? preview.note : preview.reason}
                </p>
                <button
                  type="submit"
                  disabled={running}
                  className="h-11 rounded-lg bg-pine text-sm font-medium text-card hover:bg-pine-deep disabled:opacity-60 sm:col-span-2"
                >
                  {running ? "Running…" : "Run job"}
                </button>
              </form>

              <button
                type="button"
                disabled={running}
                onClick={() => runJob(undefined, { count: 7, budget: "21.00" })}
                className="mt-3 w-full rounded-xl border border-brick/40 bg-brick-soft px-4 py-3 text-left hover:bg-brick-soft/80 disabled:opacity-60"
              >
                <p className="font-medium text-brick">Try a job over the cap</p>
                <p className="mt-1 text-xs text-brick/90">
                  7 wallets × $3.00 = $21.00, above Agent A&apos;s $20.00 per-tx cap. Money must not move.
                </p>
              </button>
            </section>

            <VaultCard vault={vault} />
          </div>

          <div className="flex flex-col gap-6">
            <ol className="rounded-2xl border border-rule bg-card" aria-live="polite">
              <li className="border-b border-rule px-6 py-5">
                <h2 className="font-serif text-2xl">Pipeline</h2>
                <p className="mt-1 text-sm text-muted">
                  Job posted → escrow funded → worker delivers → live check → receipt.
                </p>
              </li>
              {steps.map((step, index) => (
                <li
                  key={step.id}
                  className={`border-t border-rule px-6 py-4 ${
                    step.status === "blocked"
                      ? "bg-brick-soft/70"
                      : step.status === "done"
                        ? "bg-ok-soft/50"
                        : step.status === "active"
                          ? "bg-wait/70"
                          : ""
                  }`}
                >
                  <p className="text-sm font-medium">
                    {index + 1}. {step.title}
                    <span className="ml-2 text-xs font-normal uppercase tracking-wide text-muted">
                      {step.status === "idle" ? "" : step.status}
                    </span>
                  </p>
                  {step.detail ? <p className="mt-1 text-sm leading-6 text-muted">{step.detail}</p> : null}
                </li>
              ))}
            </ol>

            {blocked ? (
              <div className="rounded-2xl border border-brick bg-brick-soft px-6 py-5">
                <h2 className="font-serif text-2xl text-brick">Spendlock stopped the job</h2>
                <p className="mt-2 text-[16px] leading-7">{blocked}</p>
                <p className="mt-2 text-sm text-muted">
                  Vault still {formatUsd(vault.vaultCents)}. Escrow {formatUsd(vault.escrowCents)}. No
                  keys, no chain, play money only.
                </p>
              </div>
            ) : null}

            {items.length > 0 || checking ? (
              <WalletTable items={items} checking={checking} mode={mode} />
            ) : null}

            {receipt ? <ReceiptCard receipt={receipt} /> : null}
          </div>
        </div>

        {note && !blocked && !receipt ? <p className="text-sm text-muted">{note}</p> : null}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-5 py-8 text-sm text-muted sm:px-8">
        Spendlock market demo · {formatUsd(PRICE_CENTS)} / verified wallet · {FEE_BPS / 100}% fee · testnet /
        simulated only · never mainnet
      </footer>
    </div>
  );
}

function HonestyBanner({
  mode,
  reason,
  blocked,
}: {
  mode: VerifyMode | null;
  reason?: string;
  blocked: boolean;
}) {
  return (
    <section className="rounded-2xl border border-rule bg-card px-5 py-4 text-sm leading-6">
      <p className="font-medium text-ink">What is real on this page</p>
      <ul className="mt-2 grid gap-1 text-muted sm:grid-cols-2">
        <li>
          <span className="text-ink">Live (when the API answers):</span> each wallet is re-checked from
          this browser against{" "}
          <span className="font-mono text-xs">api.hyperliquid.xyz/info</span> using the same rules as{" "}
          <span className="font-mono text-xs">market/agents/walletRules.js</span>.
        </li>
        <li>
          <span className="text-ink">Recorded:</span> candidate addresses are a leaderboard snapshot
          plus one empty account. If the API is blocked, checks replay a {RECORDED_AT} snapshot and the
          pipeline says so.
        </li>
        <li>
          <span className="text-ink">Simulated:</span> Spendlock vault, ResultEscrow funding, 2% fee,
          worker payout, and refunds. No chain, no private keys, play USDC.
        </li>
        <li>
          <span className="text-ink">This run:</span>{" "}
          {blocked
            ? "Spendlock blocked the job before escrow. No Hyperliquid calls."
            : mode === "live"
              ? "Hyperliquid checks are live."
              : mode === "recorded"
                ? `Recorded snapshot. ${reason ?? ""}`
                : "Not started."}
        </li>
      </ul>
    </section>
  );
}

function VaultCard({ vault }: { vault: MarketVault }) {
  const agent = vault.agent;
  const dailyLeft = Math.max(0, agent.dailyLimitCents - agent.spentTodayCents);
  const budgetLeft = Math.max(0, agent.totalBudgetCents - agent.spentTotalCents);
  return (
    <section className="rounded-2xl border border-rule bg-card">
      <div className="border-b border-rule px-6 py-5">
        <h2 className="font-serif text-2xl">Capped vault</h2>
        <p className="mt-1 text-sm text-muted">
          Agent A may pay ResultEscrow only. Caps match the Spendlock check order.
        </p>
      </div>
      <dl className="grid gap-px bg-rule sm:grid-cols-2">
        <Stat label="Vault balance" value={formatUsd(vault.vaultCents)} hint="Play USDC. Owner-funded." />
        <Stat label="In escrow" value={formatUsd(vault.escrowCents)} hint="Locked until settle or refund." />
        <Stat
          label="Per-tx cap"
          value={formatUsd(agent.perTxCents)}
          hint={`${agent.name} · ${shortAddress(agent.address)}`}
        />
        <Stat
          label="Daily / lifetime left"
          value={`${formatUsd(dailyLeft)} / ${formatUsd(budgetLeft)}`}
          hint={`Daily ${formatUsd(agent.dailyLimitCents)} · budget ${formatUsd(agent.totalBudgetCents)}`}
        />
        <Stat label="Allowlist" value="ResultEscrow" hint="A stranger address would be rejected." />
        <Stat
          label="Escrow job cap"
          value={formatUsd(MAX_JOB_BUDGET_CENTS)}
          hint={`${formatUsd(PRICE_CENTS)} each · ${FEE_BPS / 100}% protocol fee`}
        />
      </dl>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="bg-card p-5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-serif text-2xl tracking-tight">{value}</dd>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}

function WalletTable({
  items,
  checking,
  mode,
}: {
  items: WalletItem[];
  checking: string | null;
  mode: VerifyMode | null;
}) {
  return (
    <section className="rounded-2xl border border-rule bg-card">
      <div className="border-b border-rule px-6 py-5">
        <h2 className="font-serif text-2xl">Wallet checks</h2>
        <p className="mt-1 text-sm text-muted">
          {mode === "live"
            ? "Live Hyperliquid info API."
            : mode === "recorded"
              ? `Recorded snapshot ${RECORDED_AT}.`
              : "Waiting."}{" "}
          Pass is paid. Fail and review are refunded.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              {["Wallet", "Status", "Why"].map((h) => (
                <th key={h} className="px-6 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.address}
                className={`border-t border-rule align-top ${
                  item.status === "pass" ? "bg-ok-soft/60" : item.status === "review" ? "bg-wait/80" : "bg-brick-soft/70"
                }`}
              >
                <td className="px-6 py-3 font-mono text-xs">{shortAddress(item.address)}</td>
                <td className="px-6 py-3 font-medium">
                  {item.status === "pass" ? "pass · paid" : item.status === "review" ? "review · refunded" : "fail · refunded"}
                </td>
                <td className="px-6 py-3 text-muted">{item.reason}</td>
              </tr>
            ))}
            {checking && !items.some((item) => item.address === checking) ? (
              <tr className="border-t border-rule bg-wait/80">
                <td className="px-6 py-3 font-mono text-xs">{shortAddress(checking)}</td>
                <td className="px-6 py-3 font-medium">checking…</td>
                <td className="px-6 py-3 text-muted">
                  {mode === "live" ? "Fetching fills and account value" : "Replaying recorded snapshot"}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReceiptCard({ receipt }: { receipt: Receipt }) {
  const s = receipt.settlement;
  return (
    <section className="rounded-2xl border border-pine/30 bg-ok-soft/40 p-6 sm:p-8">
      <h2 className="font-serif text-2xl">Receipt · job #{receipt.jobId}</h2>
      <p className="mt-1 text-sm text-muted">
        Simulated settlement. Report fingerprint {receipt.fingerprint}… ·{" "}
        {receipt.mode === "live" ? "Hyperliquid checks were live." : `Recorded snapshot. ${receipt.modeReason ?? ""}`}
      </p>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted">Worker payout</dt>
          <dd className="font-serif text-3xl">{formatUsd(s.toWorkerCents)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Protocol fee ({FEE_BPS / 100}%)</dt>
          <dd className="font-serif text-3xl">{formatUsd(s.feeCents)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Refund to vault</dt>
          <dd className="font-serif text-3xl">{formatUsd(s.refundCents)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Verified / submitted</dt>
          <dd className="font-serif text-3xl">
            {s.verifiedCount}/{s.submitted}
          </dd>
        </div>
      </dl>
      <p className="mt-5 text-[15px] leading-7">{receipt.capLine}</p>
      <p className="mt-2 text-sm text-muted">
        Vault now {formatUsd(receipt.vaultAfter.vaultCents)}. Agent spend this job still counts against
        daily and lifetime limits (refunds do not restore the cap — same as the contract).
      </p>
    </section>
  );
}
