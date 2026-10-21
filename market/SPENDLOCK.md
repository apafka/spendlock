# Spendlock: agent spend rails (plain-English guide)

> Local MVP, built 2026-10-19. Play money only (MockUSDC on a local chain). The contract is **unaudited**; never put real money in it.

## What it is

Spendlock is a **vault for USDC** with **rules for each AI agent** written into a smart contract.

- The **owner** (you, or your company) puts USDC into the vault.
- The owner gives each **agent** (a bot, an AI assistant, a script) a set of rules: how much per payment, how much per day, how much in total, who it may pay, and until when.
- The agent can then pay for things by itself, but **only inside those rules**. The contract checks every payment. If a rule says no, the money does not move, and the "no" is recorded on the blockchain.

Think of it as a company card for a bot, except the card limits live in code that nobody (not even the bot's developer) can quietly bypass.

## Why agents need it

AI agents are starting to buy things: data, API calls, compute, other agents' work. Giving an agent a normal wallet is scary:

- A bug, a bad prompt, or a prompt-injection attack can make it spend everything.
- Off-chain limits (in the agent's own code, or a provider's server) can be wrong, skipped, or changed.
- After the fact, it is hard to see what the agent tried to do.

Spendlock gives you **hard limits** (enforced by the contract), an **approval step** for big payments, an **emergency stop**, and a **complete audit trail**.

## How the rules work

Each agent has a policy. Every spend is checked in this order; the first rule that fails rejects it:

| Rule | What it means | Example in the demo |
|---|---|---|
| Kill switch | One switch that stops **all** agents at once | Flipped at the end of the demo |
| Agent active / paused | The owner can pause one agent | Pause button on the dashboard |
| Expiry | After this date the agent cannot spend | Agent A expires in 30 days |
| Allowlist | The agent may only pay listed addresses or contracts | Agent A may only pay ResultEscrow |
| Per-transaction cap | Max size of one payment | $20 |
| Daily limit | Max per calendar day (UTC). Resets at 00:00 UTC | $20/day |
| Total budget | Max over the agent's whole life | $60 |
| Vault balance | The vault must hold enough | $100 funded |
| Approval threshold | Payments **above** this are not rejected; they wait for the owner to approve or reject | Above $15 |

Details worth knowing:

- **Rejections don't crash.** A rejected spend is a normal transaction that emits `SpendRejected(agent, to, amount, reason, memo)`. That is why rejections show up in the audit trail.
- **Approval re-checks everything.** When the owner approves a pending request, all the rules are checked again at that moment (daily limit, kill switch, pause, expiry). Approval only lifts the "above threshold" rule.
- **Paying a contract** (`approveAndCall`): the vault approves the target for at most `amount`, calls it, then sets the approval back to 0. Only what the target actually pulled counts against the limits. The vault refuses to "call" the USDC token itself or the vault itself, so this path can't be used to bypass the rules.
- **Refunds come back to the vault.** When an agent funds a ResultEscrow job, the vault is the escrow's "client", so refunds for unverified items go straight back to the vault. Refunds do **not** give the agent its limit back (the conservative choice).
- **Two-step ownership.** Changing the owner needs the new owner to accept (OpenZeppelin `Ownable2Step`), so a typo can't hand the vault to a wrong address. Token transfers use OpenZeppelin `SafeERC20`, and spends are protected against re-entrancy.
- **Audit trail.** Events for everything: `Funded`, `Withdrawn`, `PolicySet`, `AllowlistSet`, `AgentPaused`, `AgentRemoved`, `KillSwitch`, `Spent`, `SpendRejected`, `SpendRequested`, `RequestRejected`, `RequestCancelled`.
- The owner can always withdraw, even with the kill switch on.

## The pieces

| File | What it does |
|---|---|
| `contracts/src/Spendlock.sol` | The vault and the rules |
| `contracts/test/Spendlock.t.sol` | 28 tests: every rule, approvals, escrow buy + refund, re-entrancy, greedy targets, 2 fuzz tests |
| `contracts/test/Spendlock.invariant.t.sol` | Invariant test: random sequences of spends, escrow jobs, refunds, approvals, pauses, kill switch, deposits, withdrawals, time jumps. It checks that no agent ever exceeds its per-tx cap, daily limit or budget, and that every token is accounted for |
| `agents/spendlock.js` | Small helper library (status, spend, buy wallets via escrow, approve) |
| `agents/spendlock-mcp.js` | MCP server for one agent: `spendlock_status`, `spendlock_spend` |
| `agents/spendlock-owner.js` | Owner command line: fund, policy, allow, pause, kill, approve, reject, status |
| `agents/deploy-spendlock.js`, `contracts/script/DeploySpendlock.s.sol` | Deploy (local or Base Sepolia; refuses Base mainnet) |
| `web/app/spendlock/page.tsx` | Owner dashboard at `/spendlock` |
| `demo-spendlock.sh` | The end-to-end demo |

## Run the demo

You need Foundry (`forge`, `anvil`) and Node. The wallet checker reads the public Hyperliquid API, so you need internet.

```bash
./demo-spendlock.sh            # about 1–2 minutes; output like demo-spendlock-output.txt
KEEP=1 ./demo-spendlock.sh     # same, but leaves the local chain running for the dashboard
cd web && npm run dev          # then open http://localhost:3000/spendlock
```

What happens (real output, 2026-10-19):

1. The owner funds **$100** and gives agent A **$20/tx, $20/day, $60 total, approval above $15**, allowed to pay **only ResultEscrow**.
2. Agent A (through its MCP tools) buys **5 verified wallets for $15** → **executed**. Escrow job #1: 5/5 verified, worker $14.70, fee $0.30. Vault $85.
3. Same day, another $15 buy → **rejected: "over daily limit"**.
4. Pay a random address $3 → **rejected: "recipient not allowed"**.
5. Next UTC day: buy 6 wallets ($18) → **pending** (request #1). The owner approves → escrow job #2. Only 5 wallets passed, so the **$3 refund went back into the vault**.
6. Agent B pays a data API $4 (executed) and asks for $8 (pending; left for the dashboard).
7. **Kill switch** on → both agents' next spends are rejected: "kill switch on".
8. Audit trail: 3 Spent, 4 SpendRejected, 2 SpendRequested, 5 policy changes. Vault: **$66** = 100 − 15 − 18 + 3 − 4.

Screenshot of the dashboard after the demo: `docs-spendlock-screenshot.png`.

### Use it from an agent (MCP)

```json
{ "mcpServers": { "spendlock": { "command": "node", "args": ["/path/to/mvp/agents/spendlock-mcp.js"], "env": { "NETWORK": "local", "SPENDLOCK_AGENT": "AGENT_A" } } } }
```

- `spendlock_status` → your rules, what you can still spend (per tx, today, budget, right now), and who you may pay.
- `spendlock_spend` → `{ to, amountUSDC, memo }` for a plain payment, or `{ buyWallets: N }` to buy N verified wallets through ResultEscrow. Returns `executed`, `pending` (with a request id) or `rejected` (with the reason).

### Base Sepolia (test network), when you have test keys

Nothing has been deployed to any public network. When you want to:

1. `cp agents/.env.example agents/.env` and fill in fresh test wallets (including `OWNER_*` and `AGENT_A_*`). Never paste keys in chat.
2. `NETWORK=base-sepolia node agents/checklist.js --spendlock` until everything is ✔.
3. `node agents/deploy.js && node agents/deploy-spendlock.js`.

## Competitors and what's different

| | What they offer | How Spendlock differs |
|---|---|---|
| **Catena Labs** | A regulated "agentic bank" (raised $48M, applied for a US trust charter): spend limits, approved recipients, audit trails, stablecoins, MCP/CLI | Catena is a bank: accounts, compliance, many chains, enterprise sales. Spendlock is a small open contract you own; the rules are onchain, not in a provider's database |
| **Skyfire** | Agent wallets, "know your agent" identity, spend limits, tokenized cards; edge partnerships (Fastly) | Skyfire's limits and identity live in its platform. Spendlock has no identity layer; it is only the hard rules, checkable by anyone |
| **Coinbase agent wallets** (CDP Policy Engine, AgentKit, Agentic Wallet CLI) | Keys held by Coinbase; policies (allowlists, value caps, per-session limits) checked **before Coinbase signs**; KYT/OFAC screening; x402 | Coinbase's rules are enforced by Coinbase's signer, off-chain. Spendlock's are enforced by the contract, so they hold even if a key or a provider is compromised. Coinbase is far more complete; Spendlock can sit on top (a CDP wallet can be an agent of a Spendlock vault) |

**What's actually different:**

1. **Rules onchain**, readable and verifiable by anyone; rejections are part of the public record.
2. **Owner approval as a built-in state** (pending → approve/reject), not a separate tool.
3. **Pays into result escrow**: an agent can buy "verified results" (ResultEscrow) with its allowance, and money for unverified items flows back to the owner's vault automatically. Pay-per-verified-result plus spend limits in one flow is the part the big players don't focus on.

Honest view (see RESEARCH.md): generic agent spend rails are a crowded, funded category. Spendlock's rails make most sense as the **trust feature inside** the verified-results product, not as a stand-alone company.

## Limits of this MVP

- Unaudited; local chain only; MockUSDC.
- Daily limit is a UTC calendar day, not a rolling 24 hours (so an agent could spend its limit at 23:59 and again at 00:01).
- Refunds don't restore an agent's limit or budget.
- Pending requests don't reserve budget; the rules are checked again when approved.
- Pending requests don't expire on their own (the owner rejects, or the agent cancels).
- One token per vault (USDC). No per-recipient caps or categories yet.
- The dashboard's approve button only moves the money; for escrow buys, `node agents/spendlock-owner.js approve <id>` also runs the wallet delivery.
- Agent keys are still keys: if an agent key leaks, the attacker gets that agent's limits (not more). Pause the agent or flip the kill switch.
