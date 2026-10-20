import type {
  Agent,
  AppState,
  LogEvent,
  SpendAttempt,
  SpendOutcome,
} from "./types";

/** Check order matches Spendlock.sol `_check`. First failure wins. */
export function utcDayKey(iso = new Date().toISOString()): string {
  return iso.slice(0, 10);
}

export function formatUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function freshSpentToday(agent: Agent, at: string): number {
  return agent.dayKey === utcDayKey(at) ? agent.spentTodayCents : 0;
}

export function remaining(agent: Agent, vaultCents: number, killed: boolean, at = new Date().toISOString()) {
  const usedToday = freshSpentToday(agent, at);
  const today = Math.max(0, agent.dailyLimitCents - usedToday);
  const budget = Math.max(0, agent.totalBudgetCents - agent.spentTotalCents);
  let spendableNow = Math.min(agent.perTxCents, today, budget, vaultCents);
  const expired = agent.expiry != null && Date.parse(at) > agent.expiry;
  if (!agent.active || agent.paused || killed || expired) spendableNow = 0;
  return { perTx: agent.perTxCents, today, budget, spendableNow, usedToday };
}

export function recipientOf(state: AppState, toId: string) {
  return state.recipients.find((item) => item.id === toId);
}

export function agentOf(state: AppState, agentId: string) {
  return state.agents.find((item) => item.id === agentId);
}

export function checkSpend(
  state: AppState,
  attempt: SpendAttempt,
): string {
  const agent = agentOf(state, attempt.agentId);
  const to = recipientOf(state, attempt.toId);
  const at = attempt.at ?? new Date().toISOString();
  if (!agent) return "agent removed";
  if (state.killed) return "kill switch on";
  if (!agent.active) return "agent removed";
  if (agent.paused) return "agent paused";
  if (agent.expiry != null && Date.parse(at) > agent.expiry) return "policy expired";
  if (!Number.isFinite(attempt.amountCents) || attempt.amountCents <= 0) return "zero amount";
  if (!to || !agent.allowlist.includes(to.id)) return "recipient not allowed";
  if (attempt.amountCents > agent.perTxCents) return "over per-tx cap";
  const usedToday = freshSpentToday(agent, at);
  if (usedToday + attempt.amountCents > agent.dailyLimitCents) return "over daily limit";
  if (agent.spentTotalCents + attempt.amountCents > agent.totalBudgetCents) {
    return "over total budget";
  }
  if (state.vaultCents < attempt.amountCents) return "vault balance too low";
  return "";
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function logEvent(partial: Omit<LogEvent, "id">): LogEvent {
  return { id: newId(), ...partial };
}

function recordUsage(agent: Agent, amountCents: number, at: string): Agent {
  const day = utcDayKey(at);
  const usedToday = agent.dayKey === day ? agent.spentTodayCents : 0;
  return {
    ...agent,
    dayKey: day,
    spentTodayCents: usedToday + amountCents,
    spentTotalCents: agent.spentTotalCents + amountCents,
  };
}

function replaceAgent(state: AppState, agent: Agent): AppState {
  return {
    ...state,
    agents: state.agents.map((item) => (item.id === agent.id ? agent : item)),
  };
}

export function applySpend(state: AppState, attempt: SpendAttempt): { state: AppState; outcome: SpendOutcome } {
  const at = attempt.at ?? new Date().toISOString();
  const agent = agentOf(state, attempt.agentId);
  const to = recipientOf(state, attempt.toId);
  const agentName = agent?.name ?? "Unknown agent";
  const toLabel = to?.label ?? attempt.toId;
  const reason = checkSpend(state, { ...attempt, at });

  if (reason) {
    const event = logEvent({
      at,
      agentId: agent?.id ?? null,
      agentName,
      kind: "rejected",
      amountCents: attempt.amountCents,
      toId: to?.id ?? attempt.toId,
      toLabel,
      reason,
      memo: attempt.memo,
    });
    return {
      state: { ...state, events: [event, ...state.events] },
      outcome: { status: "rejected", event },
    };
  }

  if (!agent || !to) {
    throw new Error("invariant: check passed without agent/recipient");
  }

  if (agent.approvalThresholdCents !== 0 && attempt.amountCents > agent.approvalThresholdCents) {
    const requestId = state.nextRequestId;
    const event = logEvent({
      at,
      agentId: agent.id,
      agentName,
      kind: "asked",
      amountCents: attempt.amountCents,
      toId: to.id,
      toLabel,
      reason: `asks owner above ${formatUsd(agent.approvalThresholdCents)}`,
      memo: attempt.memo,
    });
    return {
      state: {
        ...state,
        nextRequestId: requestId + 1,
        requests: [
          {
            id: requestId,
            agentId: agent.id,
            toId: to.id,
            amountCents: attempt.amountCents,
            memo: attempt.memo,
            createdAt: at,
            status: "pending",
          },
          ...state.requests,
        ],
        events: [event, ...state.events],
      },
      outcome: { status: "pending", event, requestId },
    };
  }

  const event = logEvent({
    at,
    agentId: agent.id,
    agentName,
    kind: "spent",
    amountCents: attempt.amountCents,
    toId: to.id,
    toLabel,
    reason: "within rules",
    memo: attempt.memo,
  });

  return {
    state: {
      ...replaceAgent(state, recordUsage(agent, attempt.amountCents, at)),
      vaultCents: state.vaultCents - attempt.amountCents,
      events: [event, ...state.events],
    },
    outcome: { status: "executed", event },
  };
}

export function approveRequest(state: AppState, id: number): AppState {
  const request = state.requests.find((item) => item.id === id && item.status === "pending");
  if (!request) return state;
  const at = new Date().toISOString();
  const reason = checkSpend(state, {
    agentId: request.agentId,
    toId: request.toId,
    amountCents: request.amountCents,
    memo: request.memo,
    at,
  });
  const agent = agentOf(state, request.agentId);
  const to = recipientOf(state, request.toId);

  if (reason) {
    const event = logEvent({
      at,
      agentId: request.agentId,
      agentName: agent?.name ?? "Unknown agent",
      kind: "request-rejected",
      amountCents: request.amountCents,
      toId: request.toId,
      toLabel: to?.label ?? request.toId,
      reason,
      memo: request.memo,
    });
    return {
      ...state,
      requests: state.requests.map((item) =>
        item.id === id ? { ...item, status: "rejected" } : item,
      ),
      events: [event, ...state.events],
    };
  }

  if (!agent) return state;
  const event = logEvent({
    at,
    agentId: agent.id,
    agentName: agent.name,
    kind: "approved",
    amountCents: request.amountCents,
    toId: request.toId,
    toLabel: to?.label ?? request.toId,
    reason: "owner approved",
    memo: request.memo,
  });
  return {
    ...replaceAgent(state, recordUsage(agent, request.amountCents, at)),
    vaultCents: state.vaultCents - request.amountCents,
    requests: state.requests.map((item) =>
      item.id === id ? { ...item, status: "approved" } : item,
    ),
    events: [event, ...state.events],
  };
}

export function rejectRequest(state: AppState, id: number, reason = "rejected by owner"): AppState {
  const request = state.requests.find((item) => item.id === id && item.status === "pending");
  if (!request) return state;
  const agent = agentOf(state, request.agentId);
  const to = recipientOf(state, request.toId);
  const event = logEvent({
    at: new Date().toISOString(),
    agentId: request.agentId,
    agentName: agent?.name ?? "Unknown agent",
    kind: "request-rejected",
    amountCents: request.amountCents,
    toId: request.toId,
    toLabel: to?.label ?? request.toId,
    reason,
    memo: request.memo,
  });
  return {
    ...state,
    requests: state.requests.map((item) =>
      item.id === id ? { ...item, status: "rejected" } : item,
    ),
    events: [event, ...state.events],
  };
}

export function setKill(state: AppState, on: boolean): AppState {
  if (state.killed === on) return state;
  const event = logEvent({
    at: new Date().toISOString(),
    agentId: null,
    agentName: "Owner",
    kind: "kill",
    amountCents: null,
    toId: null,
    toLabel: "all agents",
    reason: on ? "kill switch on · all spending stopped" : "kill switch off",
    memo: "",
  });
  return { ...state, killed: on, events: [event, ...state.events] };
}

export function setAgentPaused(state: AppState, agentId: string, paused: boolean): AppState {
  const agent = agentOf(state, agentId);
  if (!agent || agent.paused === paused) return state;
  const event = logEvent({
    at: new Date().toISOString(),
    agentId: agent.id,
    agentName: agent.name,
    kind: "pause",
    amountCents: null,
    toId: null,
    toLabel: agent.name,
    reason: paused ? "agent paused" : "agent resumed",
    memo: "",
  });
  return {
    ...replaceAgent(state, { ...agent, paused }),
    events: [event, ...state.events],
  };
}

export function eventsToCsv(events: LogEvent[]): string {
  const header = ["time", "agent", "event", "amount_usd", "to", "reason", "memo"];
  const rows = events.map((event) =>
    [
      event.at,
      event.agentName,
      event.kind,
      event.amountCents == null ? "" : (event.amountCents / 100).toFixed(2),
      event.toLabel,
      event.reason,
      event.memo,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n") + "\n";
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}
