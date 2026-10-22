"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { SpendlockMark } from "@/components/mark";
import {
  formatUsd,
  remaining,
  shortAddress,
} from "@/lib/engine";
import { RECIPIENTS } from "@/lib/seed";
import { useSpendlock } from "@/lib/use-spendlock";
import type { ApprovalRequest, LogEvent, SpendOutcome } from "@/lib/types";

export function DemoDashboard() {
  const app = useSpendlock();
  const [last, setLast] = useState<SpendOutcome | null>(null);

  if (!app.state) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-24 text-muted">
        Loading the simulated demo…
      </div>
    );
  }

  const { state } = app;
  const pending = state.requests.filter((item) => item.status === "pending");

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
              onClick={() => {
                app.reset();
                setLast(null);
              }}
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
            Simulated owner dashboard
          </p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight text-ink">
            Spendlock: owner dashboard
          </h1>
          <p className="mt-2 max-w-2xl text-[16px] leading-7 text-muted">
            No wallet, no keys. Play money in the browser. The rules match the contract: per-agent
            caps, allowlist, approval above a threshold, kill switch, readable log.
          </p>
        </div>

        <section className="grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Vault balance" value={formatUsd(state.vaultCents)} hint="Play USDC. Owner-funded." />
          <Stat label="Agents" value={String(state.agents.length)} hint="Each has its own caps." />
          <Stat
            label="Pending approvals"
            value={String(pending.length)}
            hint="Above-threshold spends wait here."
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

        <AgentsTable app={app} />

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
            Freeze every agent this instant. Owner can still withdraw. Turn it back off when you
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
          Spends above an agent&apos;s threshold wait here. Approving re-checks every rule (caps,
          allowlist, kill switch).
        </p>
      </div>
      {pending.length === 0 ? (
        <p className="px-6 py-5 text-sm text-muted">
          None. Try &ldquo;Ask owner: $8 data feed&rdquo; below.
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

function AgentsTable({ app }: { app: ReturnType<typeof useSpendlock> }) {
  const state = app.state!;
  return (
    <section className="rounded-2xl border border-rule bg-card">
      <div className="border-b border-rule px-6 py-5">
        <h2 className="font-serif text-2xl">Agents and rules</h2>
        <p className="mt-1 text-sm text-muted">
          Per-agent caps. Ask-owner threshold. Allowlist. Pause one agent without killing the rest.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              {[
                "Agent",
                "Per tx",
                "Daily (spent today)",
                "Budget left",
                "Ask owner above",
                "Expires",
                "May pay",
                "State",
              ].map((h) => (
                <th key={h} className="px-6 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.agents.map((agent) => {
              const left = remaining(agent, state.vaultCents, state.killed);
              const allowed = agent.allowlist
                .map((id) => state.recipients.find((item) => item.id === id)?.label ?? id)
                .join(", ");
              return (
                <tr key={agent.id} className="border-t border-rule align-top">
                  <td className="px-6 py-3">
                    <p className="font-medium">{agent.name}</p>
                    <p className="text-xs text-muted">{agent.role}</p>
                    <p className="font-mono text-xs text-muted">{shortAddress(agent.address)}</p>
                  </td>
                  <td className="px-6 py-3">{formatUsd(agent.perTxCents)}</td>
                  <td className="px-6 py-3">
                    {formatUsd(agent.dailyLimitCents)} ({formatUsd(left.usedToday)})
                  </td>
                  <td className="px-6 py-3">
                    {formatUsd(left.budget)} of {formatUsd(agent.totalBudgetCents)}
                  </td>
                  <td className="px-6 py-3 font-medium">
                    {agent.approvalThresholdCents
                      ? formatUsd(agent.approvalThresholdCents)
                      : "never"}
                  </td>
                  <td className="px-6 py-3">
                    {agent.expiry ? new Date(agent.expiry).toISOString().slice(0, 10) : "never"}
                  </td>
                  <td className="px-6 py-3">{allowed}</td>
                  <td className="px-6 py-3">
                    <p>
                      {!agent.active
                        ? "removed"
                        : agent.paused
                          ? "paused"
                          : state.killed
                            ? "stopped (kill switch)"
                            : `can spend ${formatUsd(left.spendableNow)} now`}
                    </p>
                    {agent.active ? (
                      <button
                        type="button"
                        onClick={() => app.togglePause(agent.id)}
                        className="mt-2 rounded border border-rule px-2 py-1 text-xs hover:bg-paper"
                      >
                        {agent.paused ? "Resume" : "Pause"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const SCENARIOS = [
  {
    id: "ok",
    label: "Spend $4 on data feed",
    hint: "Agent B · allowlisted · under cap",
    agentId: "b",
    toId: RECIPIENTS.feed.id,
    amountCents: 400,
    memo: "market data, 1 day",
  },
  {
    id: "cap",
    label: "Over the cap: $12",
    hint: "Agent B · $12 > $10 per-tx",
    agentId: "b",
    toId: RECIPIENTS.feed.id,
    amountCents: 1_200,
    memo: "over per-tx cap",
  },
  {
    id: "allow",
    label: "Pay a stranger $3",
    hint: "Agent A · not on allowlist",
    agentId: "a",
    toId: RECIPIENTS.stranger.id,
    amountCents: 300,
    memo: "tip a stranger",
  },
  {
    id: "ask",
    label: "Ask owner: $8 data feed",
    hint: "Agent B · above $5 threshold",
    agentId: "b",
    toId: RECIPIENTS.feed.id,
    amountCents: 800,
    memo: "premium data feed",
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
  const [agentId, setAgentId] = useState<string>(state.agents[1]?.id ?? "b");
  const [toId, setToId] = useState<string>(RECIPIENTS.feed.id);
  const [amount, setAmount] = useState("4.00");
  const [memo, setMemo] = useState("try a spend");

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
        Four rails, one click each. Then hit the kill switch above. Every action lands in the log.
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
      ? "Spent"
      : outcome.status === "pending"
        ? `Waiting for owner (request #${outcome.requestId})`
        : "Rejected";
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
          <h2 className="font-serif text-2xl">Recent spends and rejections</h2>
          <p className="mt-1 text-sm text-muted">Plain English. Who, what, how much, and why.</p>
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
  if (event.kind === "rejected" || event.kind === "request-rejected" || event.kind === "kill") {
    return "bg-brick-soft/70";
  }
  if (event.kind === "asked") return "bg-wait/80";
  return "";
}

function eventLabel(event: LogEvent): string {
  switch (event.kind) {
    case "spent":
      return "spent";
    case "rejected":
      return "REJECTED";
    case "asked":
      return "asked approval";
    case "approved":
      return "approved";
    case "request-rejected":
      return "request rejected";
    case "kill":
      return "kill switch";
    case "pause":
      return "pause";
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
