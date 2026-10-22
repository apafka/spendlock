import type { InfoFn } from "./hl-info";
import type { WalletCandidate, WalletSpec } from "./wallet-rules";

/** $3 per verified wallet — same as market/agents/data/hl-wallets-spec.json */
export const PRICE_CENTS = 300;
/** ResultEscrow fee: 200 bps = 2% */
export const FEE_BPS = 200;
/** ResultEscrow maxJobBudget for this demo */
export const MAX_JOB_BUDGET_CENTS = 10_000;
export const MAX_WALLETS = 40;

export const JOB_SPEC: WalletSpec = {
  maxItems: 4,
  rules: {
    windowDays: 30,
    minRealizedPnlUsd: 10_000,
    minTrades: 20,
    minAccountValueUsd: 50_000,
    claimTolerance: 0.1,
  },
};

export const JOB_TITLE = "Profitable active Hyperliquid perp traders (last 30 days)";

export type MarketAgent = {
  id: string;
  name: string;
  role: string;
  address: string;
  perTxCents: number;
  dailyLimitCents: number;
  totalBudgetCents: number;
  spentTodayCents: number;
  spentTotalCents: number;
  active: boolean;
  paused: boolean;
  killed: boolean;
};

export type MarketVault = {
  vaultCents: number;
  escrowCents: number;
  workerCents: number;
  feeCents: number;
  agent: MarketAgent;
  jobCount: number;
};

export function createMarketVault(): MarketVault {
  return {
    vaultCents: 10_000,
    escrowCents: 0,
    workerCents: 0,
    feeCents: 0,
    jobCount: 0,
    agent: {
      id: "a",
      name: "Agent A",
      role: "Research — buys verified Hyperliquid wallets",
      address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
      perTxCents: 2_000,
      dailyLimitCents: 5_000,
      totalBudgetCents: 6_000,
      spentTodayCents: 0,
      spentTotalCents: 0,
      active: true,
      paused: false,
      killed: false,
    },
  };
}

export type Candidate = WalletCandidate & { empty?: boolean };

/**
 * Recorded leaderboard snapshot (addresses from market/agents/data/hl-candidates.csv)
 * plus one empty account so a typical run shows a refund.
 * Ordered so the default 4-wallet job hits modest fill counts first.
 */
export const CANDIDATES: Candidate[] = [
  { address: "0x3ee505ba316879d246a8fd2b3d7ee63b51b44fab", label: "0x3ee5…4fab" },
  { address: "0xaeaab54bbf65bfd6efed7d2eb68372298e3c2416", label: "0xaeaa…2416" },
  { address: "0x53969485d7422b35c7fe5a4025498f9b69268b79", label: "0x5396…8b79" },
  { address: "0x08c14b32c8a48894e4b933090ebcc9ce33b21135", label: "0x08c1…1135" },
  { address: "0xf29c6bc1147a841519b382459a6d7a373c6b9971", label: "0xf29c…9971" },
  { address: "0x13da9d69a9b8a28495ade07d3ff1c61d024808be", label: "0x13da…08be" },
  { address: "0xbd334a55db91617545e8d1b09941e036ad8e4200", label: "0xbd33…4200" },
  {
    address: "0x0000000000000000000000000000000000000001",
    label: "empty account",
    empty: true,
  },
];

/** Compact Hyperliquid snapshots captured 2026-10-22 for the recorded fallback. */
export const RECORDED_AT = "2026-10-22T02:27:37Z";

export type WalletSnapshot = {
  accountValue: number;
  spotStables: number;
  trades: number;
  pnl: number;
};

export const FIXTURES: Record<string, WalletSnapshot> = {
  "0x08c14b32c8a48894e4b933090ebcc9ce33b21135": {
    accountValue: 964760.47,
    spotStables: 1705997.07,
    trades: 575,
    pnl: 36575.0,
  },
  "0x3ee505ba316879d246a8fd2b3d7ee63b51b44fab": {
    accountValue: 1323452.87,
    spotStables: 1954072.59,
    trades: 118,
    pnl: 27415.32,
  },
  "0x13da9d69a9b8a28495ade07d3ff1c61d024808be": {
    accountValue: 964140.5,
    spotStables: 1028744.55,
    trades: 2000,
    pnl: 4936039.36,
  },
  "0xf29c6bc1147a841519b382459a6d7a373c6b9971": {
    accountValue: 0.0,
    spotStables: 4598992.17,
    trades: 1069,
    pnl: 542572.79,
  },
  "0x53969485d7422b35c7fe5a4025498f9b69268b79": {
    accountValue: 1372898.25,
    spotStables: 2308165.23,
    trades: 477,
    pnl: 327642.72,
  },
  "0xbd334a55db91617545e8d1b09941e036ad8e4200": {
    accountValue: 1419480.11,
    spotStables: 9248711.57,
    trades: 2000,
    pnl: 4042271.01,
  },
  "0xaeaab54bbf65bfd6efed7d2eb68372298e3c2416": {
    accountValue: 0.0,
    spotStables: 456566.66,
    trades: 153,
    pnl: 1229162.73,
  },
  "0x0000000000000000000000000000000000000001": {
    accountValue: 0.1,
    spotStables: 13.2,
    trades: 0,
    pnl: 0,
  },
};

export function pickCandidates(count: number): Candidate[] {
  const reals = CANDIDATES.filter((c) => !c.empty);
  const empty = CANDIDATES.find((c) => c.empty);
  if (count <= 1) return reals.slice(0, 1);
  if (!empty) return reals.slice(0, count);
  const nReal = Math.min(count - 1, reals.length);
  return [...reals.slice(0, nReal), empty];
}

/** Replay compact snapshots as the Hyperliquid info API shape. */
export function recordedInfo(now = Date.now()): InfoFn {
  return async (body) => {
    const user = String(body.user || "").toLowerCase();
    const snap = FIXTURES[user];
    if (!snap) return null;
    if (body.type === "clearinghouseState") {
      return { marginSummary: { accountValue: String(snap.accountValue) } };
    }
    if (body.type === "spotClearinghouseState") {
      return { balances: [{ coin: "USDC", total: String(snap.spotStables) }] };
    }
    if (body.type === "userFillsByTime") {
      const windowMs = 30 * 86_400_000;
      const origin = now - windowMs;
      const startTime = Number(body.startTime) || origin;
      const fills = [];
      const pnlEach = snap.trades ? snap.pnl / snap.trades : 0;
      for (let i = 0; i < snap.trades; i++) {
        const time = origin + i + 1;
        if (time < startTime) continue;
        fills.push({ closedPnl: String(pnlEach), fee: "0", time });
        if (fills.length >= 2000) break;
      }
      return fills;
    }
    return null;
  };
}
