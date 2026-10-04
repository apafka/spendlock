"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, type ReactNode } from "react";
import { formatUsd } from "@/lib/policy";
import { useSpendlock } from "@/lib/use-spendlock";
import { SpendlockMark } from "./mark";

export function Dashboard() {
  const app = useSpendlock();
  const [formEpoch, setFormEpoch] = useState(0);

  if (!app.state) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-24 text-muted">
        Loading the local demo…
      </div>
    );
  }

  const { state, todayCents } = app;
  const remainingCap = Math.max(0, state.policy.dailyCapCents - todayCents);
  const capRatio =
    state.policy.dailyCapCents === 0
      ? 1
      : Math.min(1, todayCents / state.policy.dailyCapCents);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-rule bg-paper/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <SpendlockMark />
            <span className="font-serif text-xl tracking-tight">Spendlock</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span
              className={`rounded-full px-3 py-1 font-medium ${
                state.policy.paused
                  ? "bg-brick-soft text-brick"
                  : "bg-ok-soft text-pine"
              }`}
            >
              {state.policy.paused ? "Frozen" : "Live"}
            </span>
            <button
              type="button"
              onClick={() => {
                app.reset();
                setFormEpoch((value) => value + 1);
              }}
              className="text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Reset demo
            </button>
          </div>
        </div>
      </header>

      {state.policy.paused ? (
        <div className="bg-brick px-5 py-3 text-center text-sm font-medium text-card">
          Kill switch is on. Every outbound spend is blocked until you resume.
        </div>
      ) : null}

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-5 py-6 sm:px-8">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-muted">
            Local demo
          </p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight text-ink">
            Policy dashboard
          </h1>
          <p className="mt-2 max-w-2xl text-[16px] leading-7 text-muted">
            Fund the policy. Cap the day. Allow only these merchants. Pause
            everything. The log tells you what would have happened.
          </p>
        </div>

        <section className="grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule md:grid-cols-3">
          <Stat
            label="Policy funds"
            value={formatUsd(state.policy.fundedCents)}
            hint="Demo balance. No card required."
          />
          <Stat
            label="Spent today"
            value={`${formatUsd(todayCents)} / ${formatUsd(state.policy.dailyCapCents)}`}
            hint={`${formatUsd(remainingCap)} left before the hard stop.`}
          >
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-paper-2">
              <div
                className={`h-full ${capRatio >= 1 ? "bg-brick" : "bg-pine"}`}
                style={{ width: `${Math.round(capRatio * 100)}%` }}
              />
            </div>
          </Stat>
          <Stat
            label="Allowlist"
            value={`${state.policy.allowlist.length} merchants`}
            hint="Domains and settlement addresses."
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <PolicyControls key={`policy-${formEpoch}`} app={app} />
          <TrySpend key={`spend-${formEpoch}`} app={app} />
        </section>

        <SpendLog app={app} />
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint: string;
  children?: ReactNode;
}) {
  return (
    <article className="bg-card p-6">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 font-serif text-3xl tracking-tight text-ink">{value}</p>
      <p className="mt-2 text-sm text-muted">{hint}</p>
      {children}
    </article>
  );
}

function PolicyControls({
  app,
}: {
  app: ReturnType<typeof useSpendlock>;
}) {
  const state = app.state!;
  const [capInput, setCapInput] = useState(
    String(state.policy.dailyCapCents / 100),
  );
  const [fundInput, setFundInput] = useState("100");
  const [merchant, setMerchant] = useState("");
  const [label, setLabel] = useState("");

  const capDirty =
    Number.parseFloat(capInput) * 100 !== state.policy.dailyCapCents;

  function saveCap(event: FormEvent) {
    event.preventDefault();
    const dollars = Number.parseFloat(capInput);
    if (!Number.isFinite(dollars) || dollars < 0) return;
    app.setDailyCap(Math.round(dollars * 100));
  }

  function addFunds(event: FormEvent) {
    event.preventDefault();
    const dollars = Number.parseFloat(fundInput);
    if (!Number.isFinite(dollars) || dollars <= 0) return;
    app.fund(Math.round(dollars * 100));
  }

  function addMerchant(event: FormEvent) {
    event.preventDefault();
    if (!app.addAllowlist(merchant, label)) return;
    setMerchant("");
    setLabel("");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-rule bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl">Kill switch</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Freeze every outbound spend. Resume when you mean it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => app.setPaused(!state.policy.paused)}
            className={`rounded-full px-5 py-2.5 text-sm font-medium ${
              state.policy.paused
                ? "bg-pine text-card hover:bg-pine-deep"
                : "bg-brick text-card hover:bg-brick/90"
            }`}
          >
            {state.policy.paused ? "Resume spend" : "Pause everything"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-rule bg-card p-6">
        <h2 className="font-serif text-2xl">Fund and cap</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Demo money on purpose. Later this is a card or a transfer. Today it
          is a number that the cap and allowlist already govern.
        </p>

        <form
          onSubmit={addFunds}
          className="mt-5 flex flex-wrap items-end gap-3"
        >
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Add funds (USD)</span>
            <input
              type="number"
              min="1"
              step="1"
              value={fundInput}
              onChange={(event) => setFundInput(event.target.value)}
              className="h-10 w-28 rounded-lg px-3"
            />
          </label>
          <button
            type="submit"
            className="h-10 rounded-lg bg-pine px-4 text-sm font-medium text-card hover:bg-pine-deep"
          >
            Fund policy
          </button>
          <button
            type="button"
            onClick={() => app.fund(10_000)}
            className="h-10 rounded-lg border border-rule px-4 text-sm hover:bg-paper"
          >
            +$100
          </button>
        </form>

        <form
          onSubmit={saveCap}
          className="mt-5 flex flex-wrap items-end gap-3 border-t border-rule pt-5"
        >
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Daily cap (USD)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={capInput}
              onChange={(event) => setCapInput(event.target.value)}
              className="h-10 w-28 rounded-lg px-3"
            />
          </label>
          <button
            type="submit"
            className="h-10 rounded-lg bg-ink px-4 text-sm font-medium text-card disabled:opacity-40"
            disabled={!capDirty}
          >
            Save cap
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-rule bg-card p-6">
        <h2 className="font-serif text-2xl">Allowlist</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Agents may pay these domains or addresses. Everything else is
          blocked.
        </p>
        <ul className="mt-4 divide-y divide-rule">
          {state.policy.allowlist.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 py-3"
            >
              <div>
                <p className="font-medium text-ink">{item.label}</p>
                <p className="font-mono text-xs text-muted">{item.value}</p>
                <p className="mt-1 text-xs uppercase tracking-wide text-muted">
                  {item.kind}
                </p>
              </div>
              <button
                type="button"
                onClick={() => app.removeAllowlist(item.id)}
                className="text-sm text-brick hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={addMerchant} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            required
            placeholder="api.openai.com or 0x…"
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
            className="h-10 rounded-lg px-3 text-sm"
          />
          <input
            placeholder="Label (optional)"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className="h-10 rounded-lg px-3 text-sm"
          />
          <button
            type="submit"
            className="h-10 rounded-lg bg-ink px-4 text-sm font-medium text-card"
          >
            Add
          </button>
        </form>
      </section>
    </div>
  );
}

function TrySpend({ app }: { app: ReturnType<typeof useSpendlock> }) {
  const state = app.state!;
  const [agentId, setAgentId] = useState(state.agents[0]?.id ?? "");
  const [merchant, setMerchant] = useState("api.openai.com");
  const [amount, setAmount] = useState("4.00");
  const last = state.events[0];

  const presets = useMemo(
    () => [
      { label: "OpenAI $4", merchant: "api.openai.com", amount: "4.00" },
      { label: "Lambda $18", merchant: "cloud.lambdalabs.com", amount: "18.00" },
      { label: "Midjourney $12", merchant: "midjourney.com", amount: "12.00" },
      { label: "Over cap $40", merchant: "api.openai.com", amount: "40.00" },
    ],
    [],
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    const dollars = Number.parseFloat(amount);
    if (!Number.isFinite(dollars)) return;
    app.trySpend({
      agentId,
      merchant,
      amountCents: Math.round(dollars * 100),
    });
  }

  return (
    <section className="rounded-2xl border border-rule bg-card p-6">
      <h2 className="font-serif text-2xl">Try a spend</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Change the cap, edit the allowlist, or hit pause — then run this. The
        newest row in the log is the verdict.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => {
              setMerchant(preset.merchant);
              setAmount(preset.amount);
            }}
            className="rounded-full border border-rule px-3 py-1.5 text-xs hover:bg-paper"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-5 grid gap-4">
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Agent</span>
          <select
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
            className="h-10 rounded-lg px-3"
          >
            {state.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} — {agent.role}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Merchant domain or address</span>
          <input
            required
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
            className="h-10 rounded-lg px-3"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Amount (USD)</span>
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="h-10 w-36 rounded-lg px-3"
          />
        </label>
        <button
          type="submit"
          className="h-11 rounded-lg bg-pine text-sm font-medium text-card hover:bg-pine-deep"
        >
          Submit spend
        </button>
      </form>

      {last ? (
        <div
          className={`mt-5 rounded-xl px-4 py-3 text-sm leading-6 ${
            last.status === "allowed"
              ? "bg-ok-soft text-pine"
              : "bg-brick-soft text-brick"
          }`}
        >
          <p className="font-medium">
            {last.status === "allowed" ? "Allowed" : "Blocked"} ·{" "}
            {formatUsd(last.amountCents)} · {last.merchantLabel}
          </p>
          <p className="mt-1">{last.reason}</p>
        </div>
      ) : null}
    </section>
  );
}

function SpendLog({ app }: { app: ReturnType<typeof useSpendlock> }) {
  const state = app.state!;

  return (
    <section className="rounded-2xl border border-rule bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-6 py-5">
        <div>
          <h2 className="font-serif text-2xl">Spend log</h2>
          <p className="mt-1 text-sm text-muted">
            Who, where, how much, allowed or blocked, and why.
          </p>
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
              <th className="px-6 py-3 font-medium">Time</th>
              <th className="px-6 py-3 font-medium">Agent</th>
              <th className="px-6 py-3 font-medium">Merchant</th>
              <th className="px-6 py-3 font-medium">Amount</th>
              <th className="px-6 py-3 font-medium">Verdict</th>
              <th className="px-6 py-3 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {state.events.map((event) => (
              <tr key={event.id} className="border-t border-rule align-top">
                <td className="whitespace-nowrap px-6 py-3 text-muted">
                  {formatTime(event.at)}
                </td>
                <td className="px-6 py-3 font-medium">{event.agentName}</td>
                <td className="px-6 py-3">
                  <div>{event.merchantLabel}</div>
                  <div className="font-mono text-xs text-muted">
                    {event.merchant}
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-3">
                  {formatUsd(event.amountCents)}
                </td>
                <td className="px-6 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      event.status === "allowed"
                        ? "bg-ok-soft text-pine"
                        : "bg-brick-soft text-brick"
                    }`}
                  >
                    {event.status}
                  </span>
                </td>
                <td className="max-w-sm px-6 py-3 text-muted">{event.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
