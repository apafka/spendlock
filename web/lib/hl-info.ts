/** Hyperliquid public info API. CORS allows browser calls (`access-control-allow-origin: *`). */

export const HL_INFO_URL = "https://api.hyperliquid.xyz/info";

export type HlFill = {
  closedPnl?: string | number;
  fee?: string | number;
  time?: number;
};

export type HlClearing = {
  marginSummary?: { accountValue?: string | number };
};

export type HlSpot = {
  balances?: { coin: string; total?: string | number }[];
};

export type HlInfoBody = {
  type: string;
  user?: string;
  startTime?: number;
  endTime?: number;
  aggregateByTime?: boolean;
};

export type InfoFn = (body: HlInfoBody) => Promise<HlClearing | HlSpot | HlFill[] | null>;

export async function hlInfo(body: HlInfoBody, tries = 2): Promise<HlClearing | HlSpot | HlFill[] | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(HL_INFO_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) return (await res.json()) as HlClearing | HlSpot | HlFill[];
    } catch {
      // retry
    }
  }
  return null;
}

export async function probeHyperliquid(): Promise<
  { mode: "live" } | { mode: "recorded"; reason: string }
> {
  try {
    const res = await fetch(HL_INFO_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "clearinghouseState",
        user: "0x0000000000000000000000000000000000000001",
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) return { mode: "live" };
    return { mode: "recorded", reason: `Hyperliquid API HTTP ${res.status}` };
  } catch {
    return {
      mode: "recorded",
      reason: "Hyperliquid API unreachable from this browser (CORS or network)",
    };
  }
}
