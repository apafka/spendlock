import { formatUsd } from "./engine";
import {
  FEE_BPS,
  JOB_SPEC,
  JOB_TITLE,
  MAX_JOB_BUDGET_CENTS,
  MAX_WALLETS,
  PRICE_CENTS,
  type MarketVault,
} from "./market-seed";

export type JobPlan =
  | {
      ok: true;
      count: number;
      requestedCount: number;
      budgetCents: number;
      lockCents: number;
      unusedBudgetCents: number;
      note: string;
    }
  | { ok: false; reason: string };

export type CapCheck =
  | { ok: true }
  | {
      ok: false;
      reason: string;
      capName: string;
      capCents: number;
      wantedCents: number;
    };

export type Settlement = {
  verifiedCount: number;
  submitted: number;
  earnedCents: number;
  feeCents: number;
  toWorkerCents: number;
  refundCents: number;
};

export function planJob(count: number, budgetCents: number): JobPlan {
  if (!Number.isFinite(count) || count < 1) {
    return { ok: false, reason: "need at least one wallet" };
  }
  if (!Number.isFinite(budgetCents) || budgetCents <= 0) {
    return { ok: false, reason: "zero amount" };
  }
  const wanted = Math.min(Math.floor(count), MAX_WALLETS);
  const affordable = Math.floor(budgetCents / PRICE_CENTS);
  if (affordable < 1) {
    return { ok: false, reason: `budget below ${formatUsd(PRICE_CENTS)} price per wallet` };
  }
  const maxItems = Math.min(wanted, affordable);
  const lockCents = maxItems * PRICE_CENTS;
  const unusedBudgetCents = budgetCents - lockCents;
  let note = `Lock ${formatUsd(lockCents)} for ${maxItems} wallet${maxItems === 1 ? "" : "s"} at ${formatUsd(PRICE_CENTS)} each.`;
  if (maxItems < wanted) {
    note += ` Budget covers ${maxItems} of ${wanted} requested.`;
  }
  if (unusedBudgetCents > 0) {
    note += ` ${formatUsd(unusedBudgetCents)} stays in the vault (price is whole wallets).`;
  }
  return {
    ok: true,
    count: maxItems,
    requestedCount: wanted,
    budgetCents,
    lockCents,
    unusedBudgetCents,
    note,
  };
}

/** Spendlock `_check` order, then ResultEscrow `over budget cap`. */
export function checkJobFunding(vault: MarketVault, lockCents: number): CapCheck {
  const agent = vault.agent;
  if (agent.killed) {
    return { ok: false, reason: "kill switch on", capName: "kill switch", capCents: 0, wantedCents: lockCents };
  }
  if (!agent.active) {
    return { ok: false, reason: "agent removed", capName: "agent", capCents: 0, wantedCents: lockCents };
  }
  if (agent.paused) {
    return { ok: false, reason: "agent paused", capName: "pause", capCents: 0, wantedCents: lockCents };
  }
  if (!Number.isFinite(lockCents) || lockCents <= 0) {
    return { ok: false, reason: "zero amount", capName: "amount", capCents: 0, wantedCents: lockCents };
  }
  if (lockCents > agent.perTxCents) {
    return {
      ok: false,
      reason: "over per-tx cap",
      capName: "Agent A per-tx cap",
      capCents: agent.perTxCents,
      wantedCents: lockCents,
    };
  }
  if (agent.spentTodayCents + lockCents > agent.dailyLimitCents) {
    return {
      ok: false,
      reason: "over daily limit",
      capName: "Agent A daily limit",
      capCents: agent.dailyLimitCents,
      wantedCents: lockCents,
    };
  }
  if (agent.spentTotalCents + lockCents > agent.totalBudgetCents) {
    return {
      ok: false,
      reason: "over total budget",
      capName: "Agent A total budget",
      capCents: agent.totalBudgetCents,
      wantedCents: lockCents,
    };
  }
  if (vault.vaultCents < lockCents) {
    return {
      ok: false,
      reason: "vault balance too low",
      capName: "vault balance",
      capCents: vault.vaultCents,
      wantedCents: lockCents,
    };
  }
  if (lockCents > MAX_JOB_BUDGET_CENTS) {
    return {
      ok: false,
      reason: "over budget cap",
      capName: "ResultEscrow job cap",
      capCents: MAX_JOB_BUDGET_CENTS,
      wantedCents: lockCents,
    };
  }
  return { ok: true };
}

export function fundJob(vault: MarketVault, lockCents: number): MarketVault {
  const agent = vault.agent;
  return {
    ...vault,
    vaultCents: vault.vaultCents - lockCents,
    escrowCents: vault.escrowCents + lockCents,
    jobCount: vault.jobCount + 1,
    agent: {
      ...agent,
      spentTodayCents: agent.spentTodayCents + lockCents,
      spentTotalCents: agent.spentTotalCents + lockCents,
    },
  };
}

/** Integer math matching ResultEscrow.settle: fee = earned * feeBps / 10_000 */
export function settleJob(submitted: number, verifiedCount: number, priceCents = PRICE_CENTS): Settlement {
  const paid = Math.min(Math.max(0, verifiedCount), submitted);
  const budget = submitted * priceCents;
  const earnedCents = paid * priceCents;
  const feeCents = Math.floor((earnedCents * FEE_BPS) / 10_000);
  const toWorkerCents = earnedCents - feeCents;
  const refundCents = budget - earnedCents;
  return { verifiedCount: paid, submitted, earnedCents, feeCents, toWorkerCents, refundCents };
}

export function applySettlement(vault: MarketVault, settlement: Settlement): MarketVault {
  return {
    ...vault,
    escrowCents: vault.escrowCents - settlement.earnedCents - settlement.refundCents,
    workerCents: vault.workerCents + settlement.toWorkerCents,
    feeCents: vault.feeCents + settlement.feeCents,
    vaultCents: vault.vaultCents + settlement.refundCents,
  };
}

export function limitingCapLine(vault: MarketVault, lockCents: number): string {
  const agent = vault.agent;
  return (
    `This job locked ${formatUsd(lockCents)}. ` +
    `The Spendlock limit that bound it is Agent A's per-tx cap of ${formatUsd(agent.perTxCents)} ` +
    `(daily ${formatUsd(agent.dailyLimitCents)}, lifetime budget ${formatUsd(agent.totalBudgetCents)}, ` +
    `escrow job cap ${formatUsd(MAX_JOB_BUDGET_CENTS)}).`
  );
}

export function blockedLine(check: Extract<CapCheck, { ok: false }>): string {
  return (
    `Spendlock stopped this job: ${formatUsd(check.wantedCents)} is ${check.reason} ` +
    `(${check.capName} ${formatUsd(check.capCents)}). Escrow was not funded.`
  );
}

export { JOB_SPEC, JOB_TITLE, PRICE_CENTS };
