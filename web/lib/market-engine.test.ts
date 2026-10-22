import assert from "node:assert/strict";
import { test } from "node:test";
import { formatUsd } from "./engine";
import {
  applySettlement,
  blockedLine,
  checkJobFunding,
  fundJob,
  planJob,
  settleJob,
} from "./market-engine";
import { createMarketVault, PRICE_CENTS } from "./market-seed";

test("planJob locks whole wallets at $3 and leaves spare budget", () => {
  const plan = planJob(4, 1250);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.count, 4);
  assert.equal(plan.lockCents, 1200);
  assert.equal(plan.unusedBudgetCents, 50);
});

test("planJob shrinks count when budget cannot cover the request", () => {
  const plan = planJob(4, 900);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.count, 3);
  assert.equal(plan.lockCents, 900);
});

test("Spendlock per-tx cap stops a $21 job and leaves the vault untouched", () => {
  const vault = createMarketVault();
  const plan = planJob(7, 2100);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.lockCents, 2100);
  const check = checkJobFunding(vault, plan.lockCents);
  assert.equal(check.ok, false);
  if (check.ok) return;
  assert.equal(check.reason, "over per-tx cap");
  assert.equal(check.capCents, 2000);
  assert.match(blockedLine(check), /\$21\.00 is over per-tx cap/);
  assert.equal(vault.vaultCents, 10_000);
  assert.equal(vault.escrowCents, 0);
});

test("escrow job cap fires only after Spendlock would allow it", () => {
  const vault = createMarketVault();
  vault.vaultCents = 20_000;
  vault.agent.perTxCents = 20_000;
  vault.agent.dailyLimitCents = 20_000;
  vault.agent.totalBudgetCents = 20_000;
  const check = checkJobFunding(vault, 10_200);
  assert.equal(check.ok, false);
  if (check.ok) return;
  assert.equal(check.reason, "over budget cap");
  assert.equal(check.capName, "ResultEscrow job cap");
});

test("a $12 job funds from the vault", () => {
  let vault = createMarketVault();
  const check = checkJobFunding(vault, 1200);
  assert.equal(check.ok, true);
  vault = fundJob(vault, 1200);
  assert.equal(vault.vaultCents, 8800);
  assert.equal(vault.escrowCents, 1200);
  assert.equal(vault.agent.spentTodayCents, 1200);
  assert.equal(vault.jobCount, 1);
});

test("settle pays 2% fee, worker the rest, refunds unverified to the vault", () => {
  let vault = fundJob(createMarketVault(), 1200);
  const settlement = settleJob(4, 3, PRICE_CENTS);
  assert.equal(settlement.earnedCents, 900);
  assert.equal(settlement.feeCents, 18);
  assert.equal(settlement.toWorkerCents, 882);
  assert.equal(settlement.refundCents, 300);
  vault = applySettlement(vault, settlement);
  assert.equal(vault.vaultCents, 9100);
  assert.equal(vault.workerCents, 882);
  assert.equal(vault.feeCents, 18);
  assert.equal(vault.escrowCents, 0);
  assert.equal(vault.agent.spentTodayCents, 1200);
  assert.equal(formatUsd(settlement.toWorkerCents), "$8.82");
});
