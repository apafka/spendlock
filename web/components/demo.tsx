"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { SpendlockMark } from "@/components/mark";
import {
  approvalRuleLabel,
  formatUsd,
  historyFor,
  remaining,
  shortAddress,
} from "@/lib/engine";
import { SELLERS } from "@/lib/seed";
import { useSpendlock } from "@/lib/use-spendlock";
import type { Agent, ApprovalRequest, LogEvent, SpendOutcome } from "@/lib/types";

type SellerRunResult = {
  sellerId: string;
  sellerLabel: string;
  outcome: SpendOutcome;
};

export function DemoDashboard() {
  const app = useSpendlock();
  const [last, setLast] = useState<SpendOutcome | null>(null);
  const [sellerRun, setSellerRun] = useState<SellerRunResult[] | null>(null);

  if (!app.state) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-24 text-muted">
        Loading the simulated demo…
      </div>
    );
  }

  const { state } = app;
  const pending = state.requests.filter((item) => item.status === "pending");

  function resetAll() {
    app.reset();
    setLast(null);
    setSellerRun(null);
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-rule bg-paper/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <SpendlockMark />
            <span className="font-serif text-xl tracking-tight">Spendlock</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/market" className="hidden text-muted underline-offset-4 hover:text-ink hover:underline sm:inline">
              Market demo
            </Link>
            <span
              className={`rounded-full px-3 py-1 font-medium ${
                state.killed ? "bg-brick-soft text-brick" : "bg-ok-soft text-pine"
              }`}
            >
              {state.killed ? "Kill switch ON" : "Live"}
            </span>
            <button
              type="button"
              onClick={resetAll}
              className="text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Reset demo
            </button>
          </div>
        </div>
      </header>

      {state.killed ? (
        <div className="bg-brick px-5 py-3 text-center text-sm font-medium text-card">
          Kill switch is on. Every agent is frozen until you turn it off.
        </div>
      ) : null}

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 py-6 sm:px-8">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-muted">
            Simulated owner dashboard · no wallet
          </p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight text-ink">Agent Profiles</h1>
          <p className="mt-2 max-w-3xl text-[16px] leading-7 text-muted">
            Each agent has its own profile: a spending limit, an approval rule, its own purchase
            history, and an off switch. Limits live in the vault, so the agent cannot raise its
            cap or skip approval. One budget across every x402 seller.
          </p>
        </div>

        <section className="grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Vault balance" value={formatUsd(state.vaultCents)} hint="Play USDC. Owner-funded. Never custodied by Spendlock." />
          <Stat label="Profiles" value={String(state.agents.filter((a) => a.active).length)} hint="One card per agent." />
          <Stat
            label="Pending approvals"
            value={String(pending.length)}
            hint="Above the approval rule, or every purchase."
            warn={pending.length > 0}
          />
          <Stat
            label="Kill switch"
            value={state.killed ? "ON: all spending stopped" : "off"}
            hint="Stops every agent at once."
            warn={state.killed}
          />
        </section>

        <KillSwitch killed={state.killed} onToggle={app.toggleKill} />

        <PendingApprovals pending={pending} app={app} />

        <AgentProfileCards app={app} />

        <ThreeSellerRun
          app={app}
          results={sellerRun}
          onRun={() => setSellerRun(app.runSellers("scout"))}
        />

        <TrySpend app={app} last={last} setLast={setLast} />

        <SpendLog app={app} />
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
}) {
  return (
    <article className={`p-6 ${warn ? "bg-brick-soft" : "bg-card"}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-2 font-serif text-3xl tracking-tight ${warn ? "text-brick" : "text-ink"}`}>
        {value}
      </p>
      <p className="mt-2 text-sm text-muted">{hint}</p>
    </article>
  );
}

function KillSwitch({ killed, onToggle }: { killed: boolean; onToggle: () => void }) {
  return (
    <section
      className={`rounded-2xl border p-6 sm:p-8 ${
        killed ? "border-brick bg-brick-soft" : "border-rule bg-card"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl">Kill switch</h2>
          <p className="mt-1 max-w-xl text-[16px] leading-7 text-muted">
            Freeze every profile this instant. Owner can still withdraw. Turn it back off when you
            mean it.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={`rounded-full px-6 py-3 text-sm font-medium ${
            killed ? "bg-pine text-card hover:bg-pine-deep" : "bg-brick text-card hover:bg-brick/90"
          }`}
        >
          {killed ? "Turn kill switch off" : "KILL SWITCH: stop all agents"}
        </button>
      </div>
    </section>
  );
}

function PendingApprovals({
  pending,
  app,
}: {
  pending: ApprovalRequest[];
  app: ReturnType<typeof useSpendlock>;
}) {
  const state = app.state!;
  return (
    <section className="rounded-2xl border border-rule bg-card">
      <div className="border-b border-rule px-6 py-5">
        <h2 className="font-serif text-2xl">Pending approvals</h2>
        <p className="mt-1 text-sm text-muted">
          Payments above an agent&apos;s approval rule wait here. Approving re-checks every rule
          (caps, allowlist, kill switch).
        </p>
      </div>
      {pending.length === 0 ? (
        <p className="px-6 py-5 text-sm text-muted">
          None. Try Ops buying company data — every purchase needs you.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                {["#", "Agent", "Pay to", "Amount", "Memo", ""].map((h) => (
                  <th key={h} className="px-6 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pending.map((request) => {
                const agent = state.agents.find((item) => item.id === request.agentId);
                const to = state.recipients.find((item) => item.id === request.toId);
                return (
                  <tr key={request.id} className="border-t border-rule bg-wait">
                    <td className="px-6 py-3">{request.id}</td>
                    <td className="px-6 py-3 font-medium">{agent?.name}</td>
                    <td className="px-6 py-3">{to?.label}</td>
                    <td className="px-6 py-3 font-medium">{formatUsd(request.amountCents)}</td>
                    <td className="px-6 py-3 text-muted">{request.memo}</td>
                    <td className="px-6 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => app.approve(request.id)}
                          className="rounded-lg bg-pine px-3 py-1.5 text-xs font-medium text-card"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => app.reject(request.id)}
                          className="rounded-lg border border-rule px-3 py-1.5 text-xs font-medium"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AgentProfileCards({ app }: { app: ReturnType<typeof useSpendlock> }) {
  const state = app.state!;
  return (
    <section id="agent-profiles">
      <div className="mb-4">
        <h2 className="font-serif text-2xl">Profiles</h2>
        <p className="mt-1 text-sm text-muted">
          One card per agent. Pause or delete a profile without touching the others. History is
          that agent&apos;s purchases only.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {state.agents.map((agent) => (
          <ProfileCard key={agent.id} agent={agent} app={app} />
        ))}
      </div>
    </section>
  );
}

function ProfileCard({
  agent,
  app,
}: {
  agent: Agent;
  app: ReturnType<typeof useSpendlock>;
}) {
  const state = app.state!;
  const left = remaining(agent, state.vaultCents, state.killed);
  const history = historyFor(state, agent.id).slice(0, 6);
  const frozen = !agent.active || agent.paused || state.killed;
  return (
    <article
      className={`flex flex-col rounded-2xl border bg-card p-5 ${
        !agent.active ? "border-rule opacity-70" : frozen ? "border-brick/40" : "border-rule"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-2xl text-ink">{agent.name}</h3>
          <p className="mt-1 text-sm text-muted">{agent.role}</p>
          <p className="mt-1 font-mono text-xs text-muted">{shortAddress(agent.address)}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            !agent.active
              ? "bg-paper-2 text-muted"
              : agent.paused
                ? "bg-brick-soft text-brick"
                : state.killed
                  ? "bg-brick-soft text-brick"
                  : "bg-ok-soft text-pine"
          }`}
        >
          {!agent.active ? "Deleted" : agent.paused ? "Paused" : state.killed ? "Frozen" : "Live"}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted">Limit</dt>
          <dd className="mt-0.5 font-medium">
            {formatUsd(agent.perTxCents)} / tx
            <span className="block text-xs font-normal text-muted">
              {formatUsd(agent.dailyLimitCents)} / day · {formatUsd(agent.totalBudgetCents)} lifetime
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-muted">Approval rule</dt>
          <dd className="mt-0.5 font-medium">{approvalRuleLabel(agent.approvalRule)}</dd>
        </div>
        <div>
          <dt className="text-muted">Spend this day</dt>
          <dd className="mt-0.5 font-medium">
            {formatUsd(left.usedToday)} of {formatUsd(agent.dailyLimitCents)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Budget left</dt>
          <dd className="mt-0.5 font-medium">{formatUsd(left.budget)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Purchase history</p>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No purchases yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm">
            {history.map((event) => (
              <li key={event.id} className="flex justify-between gap-2">
                <span>
                  <span className="font-medium">{eventLabel(event)}</span>
                  <span className="text-muted"> · {event.toLabel}</span>
                </span>
                <span className="whitespace-nowrap">
                  {event.amountCents == null ? "" : formatUsd(event.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {agent.active ? (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => app.togglePause(agent.id)}
            className="rounded-lg border border-rule px-3 py-1.5 text-xs font-medium hover:bg-paper"
          >
            {agent.paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            onClick={() => app.deleteAgent(agent.id)}
            className="rounded-lg border border-rule px-3 py-1.5 text-xs font-medium text-brick hover:bg-brick-soft"
          >
            Delete
          </button>
        </div>
      ) : null}
    </article>
  );
}

function ThreeSellerRun({
  app,
  results,
  onRun,
}: {
  app: ReturnType<typeof useSpendlock>;
  results: SellerRunResult[] | null;
  onRun: () => void;
}) {
  const sellers = app.state!.sellers;
  return (
    <section id="three-sellers" className="rounded-2xl border border-rule bg-card p-6 sm:p-8">
      <h2 className="font-serif text-2xl">One agent, three sellers, one budget</h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
        Scout hits three x402 sellers (HTTP 402, pay in USDC, retry with proof). The first two
        are under the $5 per-tx cap and auto-approve under $50. The $25 dataset is blocked by
        the cap — before any payment leaves the vault.
      </p>

      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        {sellers.map((seller) => (
          <li key={seller.id} className="rounded-xl border border-rule bg-paper px-4 py-3">
            <p className="font-medium">{seller.label}</p>
            <p className="text-sm text-muted">{formatUsd(seller.priceCents)} · x402</p>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={onRun}
        className="mt-5 rounded-full bg-pine px-5 py-3 text-sm font-medium text-card hover:bg-pine-deep"
      >
        Run Scout against all three
      </button>

      {results ? (
        <ol className="mt-5 space-y-2">
          {results.map((step) => (
            <li
              key={step.sellerId}
              className={`rounded-xl px-4 py-3 text-sm ${
                step.outcome.status === "executed"
                  ? "bg-ok-soft text-pine"
                  : step.outcome.status === "pending"
                    ? "bg-wait text-wait-ink"
                    : "bg-brick-soft text-brick"
              }`}
            >
              <p className="font-medium">
                402 {step.sellerLabel}
                {step.outcome.event.amountCents != null
                  ? ` · ${formatUsd(step.outcome.event.amountCents)}`
                  : ""}{" "}
                → {outcomeWord(step.outcome)}
              </p>
              <p className="mt-1">
                {step.outcome.event.reason}
                {step.outcome.event.memo ? ` · ${step.outcome.event.memo}` : ""}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function outcomeWord(outcome: SpendOutcome): string {
  if (outcome.status === "executed") return "paid";
  if (outcome.status === "pending") return `waiting for approval (#${outcome.requestId})`;
  return "blocked";
}

const SCENARIOS = [
  {
    id: "ops-ask",
    label: "Ops buys company data $0.50",
    hint: "Approve every purchase → waits for you",
    agentId: "ops",
    toId: SELLERS.company.id,
    amountCents: 50,
    memo: "x402 company snapshot",
  },
  {
    id: "scout-ok",
    label: "Scout buys price feed $0.02",
    hint: "Auto-approve under $50 · under cap",
    agentId: "scout",
    toId: SELLERS.feed.id,
    amountCents: 2,
    memo: "x402 price tick",
  },
  {
    id: "cap",
    label: "Scout buys the $25 dataset",
    hint: "Over the $5 per-tx cap → blocked",
    agentId: "scout",
    toId: SELLERS.dataset.id,
    amountCents: 2_500,
    memo: "x402 full dataset",
  },
  {
    id: "allow",
    label: "Scout pays a stranger $3",
    hint: "Not on the seller allowlist → blocked",
    agentId: "scout",
    toId: "stranger",
    amountCents: 300,
    memo: "tip a stranger",
  },
] as const;

function TrySpend({
  app,
  last,
  setLast,
}: {
  app: ReturnType<typeof useSpendlock>;
  last: SpendOutcome | null;
  setLast: (outcome: SpendOutcome | null) => void;
}) {
  const state = app.state!;
  const [agentId, setAgentId] = useState<string>("ops");
  const [toId, setToId] = useState<string>(SELLERS.company.id);
  const [amount, setAmount] = useState("0.50");
  const [memo, setMemo] = useState("x402 company snapshot");

  function submit(event: FormEvent) {
    event.preventDefault();
    const dollars = Number.parseFloat(amount);
    if (!Number.isFinite(dollars)) return;
    const outcome = app.trySpend({
      agentId,
      toId,
      amountCents: Math.round(dollars * 100),
      memo,
    });
    setLast(outcome);
  }

  function runScenario(id: (typeof SCENARIOS)[number]["id"]) {
    const scenario = SCENARIOS.find((item) => item.id === id);
    if (!scenario) return;
    setAgentId(scenario.agentId);
    setToId(scenario.toId);
    setAmount((scenario.amountCents / 100).toFixed(2));
    setMemo(scenario.memo);
    const outcome = app.trySpend({
      agentId: scenario.agentId,
      toId: scenario.toId,
      amountCents: scenario.amountCents,
      memo: scenario.memo,
    });
    setLast(outcome);
  }

  return (
    <section className="rounded-2xl border border-rule bg-card p-6 sm:p-8">
      <h2 className="font-serif text-2xl">Try a spend</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Approval-required Ops, a cheap auto-approved buy, the $25 block, and a stranger off the
        allowlist.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {SCENARIOS.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            onClick={() => runScenario(scenario.id)}
            className="rounded-xl border border-rule px-4 py-3 text-left hover:bg-paper"
          >
            <p className="font-medium text-ink">{scenario.label}</p>
            <p className="mt-1 text-xs text-muted">{scenario.hint}</p>
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Agent</span>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="h-10 rounded-lg px-3">
            {state.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Pay to</span>
          <select value={toId} onChange={(e) => setToId(e.target.value)} className="h-10 rounded-lg px-3">
            {state.recipients.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Amount (USD)</span>
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-10 rounded-lg px-3"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Memo</span>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="h-10 rounded-lg px-3"
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-lg bg-pine text-sm font-medium text-card hover:bg-pine-deep sm:col-span-2 lg:col-span-4"
        >
          Submit spend
        </button>
      </form>

      {last ? <OutcomeBanner outcome={last} /> : null}
    </section>
  );
}

function OutcomeBanner({ outcome }: { outcome: SpendOutcome }) {
  const tone =
    outcome.status === "executed"
      ? "bg-ok-soft text-pine"
      : outcome.status === "pending"
        ? "bg-wait text-wait-ink"
        : "bg-brick-soft text-brick";
  const label =
    outcome.status === "executed"
      ? "Paid"
      : outcome.status === "pending"
        ? `Waiting for owner (request #${outcome.requestId})`
        : "Blocked";
  return (
    <div className={`mt-5 rounded-xl px-4 py-3 text-sm leading-6 ${tone}`}>
      <p className="font-medium">
        {label}
        {outcome.event.amountCents != null ? ` · ${formatUsd(outcome.event.amountCents)}` : ""} ·{" "}
        {outcome.event.toLabel}
      </p>
      <p className="mt-1">
        {outcome.event.reason}
        {outcome.event.memo ? ` · ${outcome.event.memo}` : ""}
      </p>
    </div>
  );
}

function SpendLog({ app }: { app: ReturnType<typeof useSpendlock> }) {
  const state = app.state!;
  return (
    <section className="rounded-2xl border border-rule bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-6 py-5">
        <div>
          <h2 className="font-serif text-2xl">Team-wide log</h2>
          <p className="mt-1 text-sm text-muted">Every agent, every seller. Paid, blocked, waiting.</p>
        </div>
        <button
          type="button"
          onClick={app.downloadCsv}
          className="rounded-full border border-rule px-4 py-2 text-sm font-medium hover:bg-paper"
        >
          Export CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              {["Time", "Agent", "Event", "Amount", "To", "Reason / memo"].map((h) => (
                <th key={h} className="px-6 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.events.map((event) => (
              <tr key={event.id} className={`border-t border-rule align-top ${rowTone(event)}`}>
                <td className="whitespace-nowrap px-6 py-3 text-muted">{formatTime(event.at)}</td>
                <td className="px-6 py-3 font-medium">{event.agentName}</td>
                <td className="px-6 py-3">{eventLabel(event)}</td>
                <td className="whitespace-nowrap px-6 py-3">
                  {event.amountCents == null ? "—" : formatUsd(event.amountCents)}
                </td>
                <td className="px-6 py-3">{event.toLabel}</td>
                <td className="max-w-md px-6 py-3">
                  {event.reason ? <span className="font-medium">{event.reason}</span> : null}
                  {event.reason && event.memo ? " · " : ""}
                  {event.memo}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function rowTone(event: LogEvent): string {
  if (event.kind === "spent" || event.kind === "approved") return "bg-ok-soft/60";
  if (event.kind === "rejected" || event.kind === "request-rejected" || event.kind === "kill" || event.kind === "deleted") {
    return "bg-brick-soft/70";
  }
  if (event.kind === "asked") return "bg-wait/80";
  return "";
}

function eventLabel(event: LogEvent): string {
  switch (event.kind) {
    case "spent":
      return "paid";
    case "rejected":
      return "blocked";
    case "asked":
      return "waiting";
    case "approved":
      return "approved";
    case "request-rejected":
      return "rejected";
    case "kill":
      return "kill switch";
    case "pause":
      return "pause";
    case "deleted":
      return "deleted";
    default:
      return event.kind;
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(date)
    .replace(",", "") + " UTC";
}
