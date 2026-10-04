import { DEFAULT_DAILY_CAP_CENTS, REASONS, reasonDailyCap } from "./policy";
import type { Agent, AllowlistItem, AppState, SpendEvent } from "./types";

const AGENTS: Agent[] = [
  {
    id: "cursor-research",
    name: "Cursor Research",
    role: "Writes and calls models from the editor",
  },
  {
    id: "deploy-bot",
    name: "Deploy Bot",
    role: "Rents GPUs and ships previews",
  },
  {
    id: "invoice-scout",
    name: "Invoice Scout",
    role: "Tries to pay vendors it finds in email",
  },
];

const ALLOWLIST: AllowlistItem[] = [
  {
    id: "openai",
    kind: "domain",
    value: "api.openai.com",
    label: "OpenAI API",
  },
  {
    id: "anthropic",
    kind: "domain",
    value: "api.anthropic.com",
    label: "Anthropic API",
  },
  {
    id: "lambda",
    kind: "domain",
    value: "cloud.lambdalabs.com",
    label: "Lambda GPU",
  },
  {
    id: "lambda-addr",
    kind: "address",
    value: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
    label: "Lambda settlement address",
  },
];

function atHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function event(partial: Omit<SpendEvent, "id">): SpendEvent {
  return { ...partial, id: crypto.randomUUID() };
}

export function createSeed(): AppState {
  const todaySpent = 420 + 680 + 1800 + 310;
  const events: SpendEvent[] = [
    event({
      agentId: "deploy-bot",
      agentName: "Deploy Bot",
      merchant: "cloud.lambdalabs.com",
      merchantLabel: "Lambda GPU",
      amountCents: 4000,
      at: atHoursAgo(0.4),
      status: "blocked",
      reason: reasonDailyCap(DEFAULT_DAILY_CAP_CENTS, todaySpent),
    }),
    event({
      agentId: "cursor-research",
      agentName: "Cursor Research",
      merchant: "api.openai.com",
      merchantLabel: "OpenAI API",
      amountCents: 310,
      at: atHoursAgo(1.2),
      status: "allowed",
      reason: REASONS.allowed,
    }),
    event({
      agentId: "invoice-scout",
      agentName: "Invoice Scout",
      merchant: "api.stripe.com",
      merchantLabel: "api.stripe.com",
      amountCents: 900,
      at: atHoursAgo(2.1),
      status: "blocked",
      reason: REASONS.notAllowlisted,
    }),
    event({
      agentId: "invoice-scout",
      agentName: "Invoice Scout",
      merchant: "www.midjourney.com",
      merchantLabel: "midjourney.com",
      amountCents: 2200,
      at: atHoursAgo(3.4),
      status: "blocked",
      reason: REASONS.notAllowlisted,
    }),
    event({
      agentId: "deploy-bot",
      agentName: "Deploy Bot",
      merchant: "cloud.lambdalabs.com",
      merchantLabel: "Lambda GPU",
      amountCents: 1800,
      at: atHoursAgo(4.5),
      status: "allowed",
      reason: REASONS.allowed,
    }),
    event({
      agentId: "cursor-research",
      agentName: "Cursor Research",
      merchant: "api.anthropic.com",
      merchantLabel: "Anthropic API",
      amountCents: 680,
      at: atHoursAgo(6),
      status: "allowed",
      reason: REASONS.allowed,
    }),
    event({
      agentId: "cursor-research",
      agentName: "Cursor Research",
      merchant: "api.openai.com",
      merchantLabel: "OpenAI API",
      amountCents: 420,
      at: atHoursAgo(8),
      status: "allowed",
      reason: REASONS.allowed,
    }),
    event({
      agentId: "deploy-bot",
      agentName: "Deploy Bot",
      merchant: "cloud.lambdalabs.com",
      merchantLabel: "Lambda GPU",
      amountCents: 4200,
      at: atHoursAgo(26),
      status: "allowed",
      reason: REASONS.allowed,
    }),
    event({
      agentId: "cursor-research",
      agentName: "Cursor Research",
      merchant: "api.openai.com",
      merchantLabel: "OpenAI API",
      amountCents: 840,
      at: atHoursAgo(30),
      status: "allowed",
      reason: REASONS.allowed,
    }),
  ];

  const fundedCents = 50_000 - (840 + 4200 + todaySpent);

  return {
    version: 1,
    policy: {
      fundedCents,
      dailyCapCents: DEFAULT_DAILY_CAP_CENTS,
      paused: false,
      allowlist: ALLOWLIST,
    },
    agents: AGENTS,
    events,
  };
}
