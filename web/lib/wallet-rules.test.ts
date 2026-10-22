import assert from "node:assert/strict";
import { test } from "node:test";
import { recordedInfo, RECORDED_AT } from "./market-seed";
import { verifyWallets } from "./wallet-rules";

const A = "0x" + "a".repeat(40);
const B = "0x" + "b".repeat(40);
const C = "0x" + "c".repeat(40);
const D = "0x" + "d".repeat(40);
const fill = (pnl: number) => ({ closedPnl: String(pnl), fee: "1" });
const db: Record<string, { av: number; fills: { closedPnl: string; fee: string; time?: number }[]; spot?: number }> = {
  [A]: { av: 80_000, fills: Array.from({ length: 25 }, () => fill(600)) },
  [B]: { av: 80_000, fills: Array.from({ length: 25 }, () => fill(-100)) },
  [C]: { av: 1000, fills: Array.from({ length: 30 }, () => fill(1000)) },
};
const info = async ({ type, user }: { type: string; user?: string }) => {
  if (user === D) return null;
  const w = db[user || ""] || { av: 0, fills: [] };
  if (type === "spotClearinghouseState") return { balances: [{ coin: "USDC", total: String(w.spot || 0) }] };
  return type === "clearinghouseState" ? { marginSummary: { accountValue: String(w.av) } } : w.fills;
};
const spec = {
  maxItems: 10,
  rules: { windowDays: 30, minRealizedPnlUsd: 10_000, minTrades: 20, minAccountValueUsd: 50_000 },
};

test("checks every wallet against the API; unreachable = review", async () => {
  const r = await verifyWallets(
    [
      { address: A.toUpperCase().replace("0X", "0x") },
      { address: B },
      { address: C },
      { address: D },
      { address: A },
      { address: "nope" },
    ],
    spec,
    { info },
  );
  assert.deepEqual(
    r.items.map((i) => i.status),
    ["pass", "fail", "fail", "review", "fail", "fail"],
  );
  assert.match(r.items[1].reason, /realized PnL/);
  assert.match(r.items[2].reason, /account value/);
  assert.equal(r.items[4].reason, "duplicate address");
  assert.equal(r.verified.length, 1);
});

test("worker claims must match reality", async () => {
  const r = await verifyWallets(
    [
      { address: A, claimed_pnl_usd: 15_000, claimed_trades: 25 },
      { address: A.replace("a", "a") },
    ],
    spec,
    { info },
  );
  assert.equal(r.items[0].status, "pass");
  const r2 = await verifyWallets([{ address: A, claimed_pnl_usd: 50_000 }], spec, { info });
  assert.equal(r2.items[0].status, "fail");
  assert.match(r2.items[0].reason, /claimed \$50000/);
});

test("exclude list and maxItems", async () => {
  const r = await verifyWallets([{ address: A }], { ...spec, rules: { ...spec.rules, excludeAddresses: [A] } }, { info });
  assert.equal(r.items[0].reason, "address on exclude list");
  db[C].av = 90_000;
  const r2 = await verifyWallets([{ address: A }, { address: C }], { ...spec, maxItems: 1 }, { info });
  assert.equal(r2.items[1].reason, "over maxItems (not paid)");
});

test("unified account: collateral in spot USDC counts as account value", async () => {
  const E = "0x" + "e".repeat(40);
  db[E] = { av: 0, spot: 4_000_000, fills: Array.from({ length: 25 }, () => fill(600)) };
  const r = await verifyWallets([{ address: E }], spec, { info });
  assert.equal(r.items[0].status, "pass");
});

test("wallet at the 10,000-fill history cap is review, not pass", async () => {
  const F = "0x" + "f".repeat(40);
  db[F] = {
    av: 90_000,
    fills: Array.from({ length: 10_000 }, (_, i) => ({ closedPnl: "5", fee: "0", time: i })),
  };
  const paged = async (q: { type: string; user?: string; startTime?: number }) =>
    q.type === "userFillsByTime" && q.user === F
      ? db[F].fills.filter((f) => (f.time ?? 0) >= (q.startTime ?? 0)).slice(0, 2000)
      : info(q);
  const r = await verifyWallets([{ address: F }], spec, { info: paged, now: 20_000 });
  assert.equal(r.items[0].status, "review");
  assert.match(r.items[0].reason, /history cap/);
  assert.equal(r.verified.length, 0);
});

test("recorded fixtures: empty account fails, a leaderboard wallet passes", async () => {
  const infoFn = recordedInfo(Date.parse(RECORDED_AT));
  const r = await verifyWallets(
    [
      { address: "0x3ee505ba316879d246a8fd2b3d7ee63b51b44fab" },
      { address: "0x0000000000000000000000000000000000000001" },
    ],
    spec,
    { info: infoFn, now: Date.parse(RECORDED_AT) },
  );
  assert.equal(r.items[0].status, "pass");
  assert.equal(r.items[1].status, "fail");
  assert.match(r.items[1].reason, /account value|trades|PnL/);
});
