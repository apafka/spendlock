import { utcDayKey } from "./engine";
import type { AppState, LogEvent } from "./types";

export const RECIPIENTS = {
  escrow: {
    id: "escrow",
    label: "ResultEscrow",
    address: "0x9fE46736679d2d9a65F0992F272de9F3c7Fa6E0",
  },
  feed: {
    id: "feed",
    label: "premium data feed",
    address: "0x000000000000000000000000000000000000a7A1",
  },
  stranger: {
    id: "stranger",
    label: "unknown recipient",
    address: "0x000000000000000000000000000000000000dEaD",
  },
} as const;

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function event(partial: Omit<LogEvent, "id"> & { id: string }): LogEvent {
  return partial;
}

export function createSeed(): AppState {
  const day = utcDayKey();
  return {
    version: 2,
    vaultCents: 8_500,
    killed: false,
    nextRequestId: 2,
    recipients: [RECIPIENTS.escrow, RECIPIENTS.feed, RECIPIENTS.stranger],
    agents: [
      {
        id: "a",
        name: "Agent A",
        role: "Research — buys verified results",
        address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
        perTxCents: 2_000,
        dailyLimitCents: 2_000,
        totalBudgetCents: 6_000,
        approvalThresholdCents: 1_500,
        expiry: Date.parse("2026-11-18T00:00:00Z"),
        active: true,
        paused: false,
        allowlist: ["escrow"],
        spentTotalCents: 1_500,
        spentTodayCents: 0,
        dayKey: utcDayKey(hoursAgo(26)),
      },
      {
        id: "b",
        name: "Agent B",
        role: "Ops — pays the data feed",
        address: "0x14dC598138a196d0B8A628720B61354Dd4559555",
        perTxCents: 1_000,
        dailyLimitCents: 2_000,
        totalBudgetCents: 4_000,
        approvalThresholdCents: 500,
        expiry: null,
        active: true,
        paused: false,
        allowlist: ["feed"],
        spentTotalCents: 400,
        spentTodayCents: 400,
        dayKey: day,
      },
      {
        id: "c",
        name: "Agent C",
        role: "Scout — small lookups only",
        address: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
        perTxCents: 1_000,
        dailyLimitCents: 1_500,
        totalBudgetCents: 3_000,
        approvalThresholdCents: 800,
        expiry: null,
        active: true,
        paused: false,
        allowlist: ["escrow", "feed"],
        spentTotalCents: 0,
        spentTodayCents: 0,
        dayKey: day,
      },
    ],
    requests: [],
    events: [
      event({
        id: "seed-spent-b",
        at: hoursAgo(0.4),
        agentId: "b",
        agentName: "Agent B",
        kind: "spent",
        amountCents: 400,
        toId: "feed",
        toLabel: "premium data feed",
        reason: "within rules",
        memo: "market data, 1 day",
      }),
      event({
        id: "seed-spent-a",
        at: hoursAgo(20),
        agentId: "a",
        agentName: "Agent A",
        kind: "spent",
        amountCents: 1_500,
        toId: "escrow",
        toLabel: "ResultEscrow",
        reason: "within rules",
        memo: "buy 5 verified results",
      }),
    ],
  };
}
