import type {
  AllowlistItem,
  AllowlistKind,
  AppState,
  Policy,
  SpendAttempt,
  SpendEvent,
  SpendVerdict,
} from "./types";

export const DEFAULT_DAILY_CAP_CENTS = 5_000;

export const REASONS = {
  paused: "Kill switch is on. All outbound spend is frozen.",
  notAllowlisted: "Merchant is not on the allowlist.",
  invalidAmount: "Amount must be greater than zero.",
  allowed: "On the allowlist and within the daily cap.",
} as const;

export function reasonDailyCap(capCents: number, spentCents: number): string {
  return `Would exceed the daily cap of ${formatUsd(capCents)} (already spent ${formatUsd(spentCents)} today).`;
}

export function reasonShortFunds(fundedCents: number): string {
  return `Policy funds are short (${formatUsd(fundedCents)} remaining).`;
}

export function formatUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

export function localDateKey(iso: string, now = new Date(iso)): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function spentTodayCents(
  events: SpendEvent[],
  at = new Date().toISOString(),
): number {
  const today = localDateKey(at, new Date(at));
  return events.reduce((sum, event) => {
    if (event.status !== "allowed") return sum;
    if (localDateKey(event.at, new Date(event.at)) !== today) return sum;
    return sum + event.amountCents;
  }, 0);
}

export function detectKind(raw: string): AllowlistKind {
  return /^0x[a-fA-F0-9]{40}$/.test(raw.trim()) ? "address" : "domain";
}

export function normalizeMerchant(raw: string): { kind: AllowlistKind; value: string } {
  const trimmed = raw.trim();
  if (detectKind(trimmed) === "address") {
    return { kind: "address", value: trimmed.toLowerCase() };
  }

  let host = trimmed;
  try {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
      host = new URL(trimmed).host;
    } else if (trimmed.includes("/")) {
      host = trimmed.split("/")[0] ?? trimmed;
    }
  } catch {
    host = trimmed;
  }

  host = host.replace(/:\d+$/, "").toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  return { kind: "domain", value: host };
}

export function isAllowlisted(
  merchant: string,
  allowlist: AllowlistItem[],
): boolean {
  const target = normalizeMerchant(merchant);
  return allowlist.some((item) => {
    const allowed = normalizeMerchant(item.value);
    if (allowed.kind !== target.kind) return false;
    if (allowed.kind === "address") {
      return allowed.value === target.value;
    }
    return (
      target.value === allowed.value ||
      target.value.endsWith(`.${allowed.value}`)
    );
  });
}

export function evaluateSpend(
  attempt: SpendAttempt,
  policy: Policy,
  events: SpendEvent[],
): SpendVerdict {
  if (!Number.isFinite(attempt.amountCents) || attempt.amountCents <= 0) {
    return { status: "blocked", reason: REASONS.invalidAmount };
  }

  if (policy.paused) {
    return { status: "blocked", reason: REASONS.paused };
  }

  if (!isAllowlisted(attempt.merchant, policy.allowlist)) {
    return { status: "blocked", reason: REASONS.notAllowlisted };
  }

  const at = attempt.at ?? new Date().toISOString();
  const alreadySpent = spentTodayCents(events, at);
  if (alreadySpent + attempt.amountCents > policy.dailyCapCents) {
    return {
      status: "blocked",
      reason: reasonDailyCap(policy.dailyCapCents, alreadySpent),
    };
  }

  if (attempt.amountCents > policy.fundedCents) {
    return { status: "blocked", reason: reasonShortFunds(policy.fundedCents) };
  }

  return { status: "allowed", reason: REASONS.allowed };
}

export function merchantLabel(
  merchant: string,
  allowlist: AllowlistItem[],
): string {
  const target = normalizeMerchant(merchant);
  const match = allowlist.find((item) => {
    const allowed = normalizeMerchant(item.value);
    return allowed.kind === target.kind && allowed.value === target.value;
  });
  if (match?.label) return match.label;
  return target.value;
}

export function applySpend(state: AppState, attempt: SpendAttempt): AppState {
  const at = attempt.at ?? new Date().toISOString();
  const agent =
    state.agents.find((item) => item.id === attempt.agentId) ?? state.agents[0];
  const normalized = normalizeMerchant(attempt.merchant);
  const verdict = evaluateSpend(
    { ...attempt, merchant: normalized.value, at },
    state.policy,
    state.events,
  );

  const event: SpendEvent = {
    id: crypto.randomUUID(),
    agentId: agent?.id ?? "unknown",
    agentName: agent?.name ?? "Unknown agent",
    merchant: normalized.value,
    merchantLabel: merchantLabel(normalized.value, state.policy.allowlist),
    amountCents: attempt.amountCents,
    at,
    status: verdict.status,
    reason: verdict.reason,
  };

  return {
    ...state,
    policy: {
      ...state.policy,
      fundedCents:
        verdict.status === "allowed"
          ? state.policy.fundedCents - attempt.amountCents
          : state.policy.fundedCents,
    },
    events: [event, ...state.events],
  };
}

export function eventsToCsv(events: SpendEvent[]): string {
  const header = [
    "time",
    "agent",
    "merchant",
    "amount_usd",
    "status",
    "reason",
  ];
  const rows = events.map((event) =>
    [
      event.at,
      event.agentName,
      event.merchant,
      (event.amountCents / 100).toFixed(2),
      event.status,
      event.reason,
    ].map(csvEscape).join(","),
  );
  return [header.join(","), ...rows].join("\n") + "\n";
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}
