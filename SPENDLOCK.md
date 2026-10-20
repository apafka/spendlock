# Spendlock: agent spend rails (plain-English guide)

> Local / testnet MVP. Play money only. The contract is **unaudited**; never put real money in it. Mainnet deploys are refused.

## What it is

Spendlock is a **vault for USDC** with **rules for each AI agent** written into a smart contract.

- The **owner** (you, or your company) puts USDC into the vault.
- The owner gives each **agent** a policy: how much per payment, how much per day, how much in total, who it may pay, until when, and when to ask the owner.
- The agent can then pay for things by itself, but **only inside those rules**. If a rule says no, the money does not move, and the "no" is recorded.

Think of it as a company card for a bot, except the limits live in code that the bot cannot quietly bypass.

## How the rules work

Each agent has a policy. Every spend is checked in this order; the first rule that fails rejects it:

| Rule | What it means |
|---|---|
| Kill switch | One switch that stops **all** agents at once |
| Agent active / paused | The owner can pause one agent |
| Expiry | After this date the agent cannot spend |
| Allowlist | The agent may only pay listed addresses or contracts |
| Per-transaction cap | Max size of one payment |
| Daily limit | Max per calendar day (UTC). Resets at 00:00 UTC |
| Total budget | Max over the agent's whole life |
| Vault balance | The vault must hold enough |
| Approval threshold | Payments **above** this wait for the owner to approve or reject |

Details worth knowing:

- **Rejections don't crash.** A rejected spend is a normal transaction that emits `SpendRejected`. That is why rejections show up in the log.
- **Approval re-checks everything.** When the owner approves a pending request, all the rules are checked again (daily limit, kill switch, pause, expiry). Approval only lifts the "above threshold" rule.
- **Paying a contract** (`approveAndCall`): the vault approves the target for at most `amount`, calls it, then sets the approval back to 0. Only what the target actually pulled counts against the limits.
- **Refunds come back to the vault.** When an agent funds a ResultEscrow job, the vault is the escrow's "client". Refunds do **not** give the agent its limit back (the conservative choice).
- **Two-step ownership.** OpenZeppelin `Ownable2Step`. Token transfers use `SafeERC20`. Spends are `nonReentrant`.
- The owner can always withdraw, even with the kill switch on.

## The pieces

| File | What it does |
|---|---|
| `contracts/src/Spendlock.sol` | The vault and the rules |
| `contracts/test/Spendlock.t.sol` | Unit + fuzz tests for every rule |
| `contracts/test/Spendlock.invariant.t.sol` | Random sequences of spends, escrow, approvals, pauses, kill switch |
| `contracts/src/ResultEscrow.sol` | Optional pay-per-verified-result escrow the vault can fund |
| `agents/spendlock-mcp.js` | MCP server: `spendlock_status`, `spendlock_spend` |
| `agents/spendlock-owner.js` | Owner CLI: fund/policy/allow/pause/kill/approve/reject |
| `web/app/page.tsx` | Founder landing |
| `web/app/demo/page.tsx` | Interactive demo (simulated, no wallet) |

## Limits of this MVP

- Unaudited; local or Base Sepolia; MockUSDC on local.
- Daily limit is a UTC calendar day, not a rolling 24 hours (an agent could spend its limit at 23:59 and again at 00:01).
- Refunds don't restore an agent's limit or budget.
- Pending requests don't reserve budget; the rules are checked again when approved.
- Pending requests don't expire on their own.
- One token per vault (USDC). No per-recipient caps or categories yet.
- Agent keys are still keys: if an agent key leaks, the attacker gets that agent's limits (not more). Pause the agent or flip the kill switch.
