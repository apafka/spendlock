import { utcDayKey } from "./engine";
import type { AppState, LogEvent, Seller } from "./types";

export const SELLERS: Record<string, Seller> = {
  feed: {
    id: "price-feed",
    label: "Price feed",
    address: "0x000000000000000000000000000000000000fEEd",
    url: "http://127.0.0.1:4021/v1/price",
    priceCents: 2,
  },
  company: {
    id: "company-data",
    label: "Company data",
    address: "0x000000000000000000000000000000000000C0da",
    url: "http://127.0.0.1:4022/v1/company",
    priceCents: 50,
  },
  dataset: {
    id: "dataset",
    label: "Expensive dataset",
    address: "0x000000000000000000000000000000000000da7A",
    url: "http://127.0.0.1:4023/v1/dataset",
    priceCents: 2_500,
  },
};

export const RECIPIENTS = {
  ...SELLERS,
  stranger: {
    id: "stranger",
    label: "unknown recipient",
    address: "0x000000000000000000000000000000000000dEaD",
  },
} as const;

const SELLER_IDS = [SELLERS.feed.id, SELLERS.company.id, SELLERS.dataset.id];

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function event(partial: Omit<LogEvent, "id"> & { id: string }): LogEvent {
  return partial;
}

export function createSeed(): AppState {
  const day = utcDayKey();
  return {
    version: 3,
    vaultCents: 1_000_000,
    killed: false,
    nextRequestId: 1,
    recipients: [SELLERS.feed, SELLERS.company, SELLERS.dataset, RECIPIENTS.stranger],
    sellers: [SELLERS.feed, SELLERS.company, SELLERS.dataset],
    agents: [
      {
        id: "scout",
        name: "Scout",
        role: "Buys data from any x402 seller under one budget",
        address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
        perTxCents: 500,
        dailyLimitCents: 5_000,
        totalBudgetCents: 10_000,
        approvalRule: 50,
        expiry: null,
        active: true,
        paused: false,
        allowlist: [...SELLER_IDS],
        blocklist: [],
        spentTotalCents: 0,
        spentTodayCents: 0,
        dayKey: day,
      },
      {
        id: "ops",
        name: "Ops",
        role: "Owner approves every purchase",
        address: "0x14dC598138a196d0B8A628720B61354Dd4559555",
        perTxCents: 10_000,
        dailyLimitCents: 20_000,
        totalBudgetCents: 50_000,
        approvalRule: "every",
        expiry: null,
        active: true,
        paused: false,
        allowlist: [...SELLER_IDS],
        blocklist: [],
        spentTotalCents: 0,
        spentTodayCents: 0,
        dayKey: day,
      },
      {
        id: "analyst",
        name: "Analyst",
        role: "Lookups only — auto-approve under $100",
        address: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
        perTxCents: 2_000,
        dailyLimitCents: 5_000,
        totalBudgetCents: 20_000,
        approvalRule: 100,
        expiry: null,
        active: true,
        paused: false,
        allowlist: [SELLERS.feed.id, SELLERS.company.id],
        blocklist: [SELLERS.dataset.id],
        spentTotalCents: 200,
        spentTodayCents: 200,
        dayKey: day,
      },
    ],
    requests: [],
    events: [
      event({
        id: "seed-spent-analyst",
        at: hoursAgo(0.5),
        agentId: "analyst",
        agentName: "Analyst",
        kind: "spent",
        amountCents: 200,
        toId: SELLERS.feed.id,
        toLabel: SELLERS.feed.label,
        reason: "within rules",
        memo: "x402 price tick",
      }),
    ],
  };
}
