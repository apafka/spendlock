# Spendlock

Spend limits your agent can't turn off.

Each agent gets its own **profile**: a spending limit, approval by default (or auto-approve under $50 / $100 / $200), a separate purchase history, and an off switch. Limits live in the team's vault, outside the agent, so a misbehaving agent cannot raise its cap or skip approval.

Walmart, Stripe, Circle each enforce limits only inside their own rails. Spendlock is the cross-platform version: **one budget, one rule set, one log** for all of a team's agents, wherever they pay. Start with x402 sellers (HTTP 402 Payment Required, pay in USDC, retry with payment proof).

Non-custodial: funds stay in the team's own Spendlock vault. Spendlock never holds customer money.

- Settlement rail: **USDC on Base**. Testnet / local play money only. **No mainnet. No token. No real funds in this repo.**
- Business: **free** (1 agent, small cap), bootstrapped **team plan EUR 29–99 / month**, optional **EUR 500** done-for-you setup.
- The contract is **unaudited**. Never put real money in it.

## What’s in this repo

| Path | What it is |
|---|---|
| `web/` | Founder landing page and a **no-wallet interactive demo** (GitHub Pages at `/spendlock/` and `/spendlock/demo/`) |
| `contracts/` | `Spendlock.sol` vault + Foundry tests (and ResultEscrow, which the vault can pay) |
| `agents/` | MCP tools (`spendlock_status`, `spendlock_spend`, `spendlock_pay`), owner CLI, mock x402 sellers, demo |
| `SPENDLOCK.md` | Plain-English guide to the onchain rules |
| `market/` | Verified-results market (including an x402 402 endpoint) |

## Run the demo (no wallet)

```bash
cd web
npm install
npm run dev
```

The app is built with `basePath: /spendlock` so local matches GitHub Pages:

- [http://localhost:3000/spendlock/](http://localhost:3000/spendlock/) — landing
- [http://localhost:3000/spendlock/demo/](http://localhost:3000/spendlock/demo/) — Agent Profiles dashboard, simulated in the browser

On the demo you will see one card per agent. Try:

1. **Run Scout against all three** — price feed $0.02 and company data $0.50 paid; the $25 dataset blocked by the per-tx cap
2. **Ops buys company data $0.50** — approval required for every purchase → waits for you
3. **KILL SWITCH** — every profile frozen; the next spend is rejected
4. **Pause / Delete** on a card — that agent only

Every action is a row in the team-wide log. Reset demo restores the seed. State lives in `localStorage` (`spendlock.demo.v3`).

## Run the x402 sellers demo (terminal)

Three local mock sellers, one agent, one budget. Simulated play money — no anvil required.

```bash
cd agents
npm install
npm test          # node --test (profiles, pay, MCP, demo story)
npm run demo      # prints the same story
```

## Run the contract tests

You need [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `anvil`).

```bash
cd contracts
forge install          # first clone only (OpenZeppelin + forge-std)
forge test
```

Or from the repo root: `./demo-spendlock.sh`

That is 43 tests: every rule, approvals, escrow buy + refund, re-entrancy, fuzz, and invariants (no agent exceeds its caps; every token is accounted for).

Optional local chain (still play money):

```bash
KEEP=1 ./demo-spendlock.sh
# prints the vault address, leaves anvil running
```

Deploy refuses mainnet chain ids.

## Dogfooding from Cursor cloud agents (MCP)

A founder gives each agent a profile on the vault, then points Cursor at the MCP server. The model gets three tools. The **profile + contract** still say no.

```json
{
  "mcpServers": {
    "spendlock": {
      "command": "node",
      "args": ["agents/spendlock-mcp.js"],
      "env": {
        "SPENDLOCK_MODE": "simulated",
        "NETWORK": "local"
      }
    }
  }
}
```

```bash
cd agents
npm install
cp .env.example .env   # fill test values; never commit .env
```

- `spendlock_status` — profiles, remaining per tx / today / budget, pause, kill switch, pending requests, per-agent history
- `spendlock_pay` — `{ agent, url, method?, body? }` → request the seller; on HTTP 402, check the profile **before** paying; then `paid`, `blocked` + reason, or `pending` (owner must approve)
- `spendlock_spend` — `{ to, amountUSDC, memo }` on-chain spend (vault / local anvil)

Owner side: `node agents/spendlock-owner.js status` (and `profile`, `pause`, `delete`, `kill`, `queue`, `approve`, `reject`).

Use **simulated** mode, a **local anvil**, or Base Sepolia. Put a test key in env, not in git. The MCP refuses mainnet chain ids. If a cloud agent is prompt-injected, it still cannot spend past the cap, off the allowlist, or through a kill switch.

## What this is not

Not a token. Not a bank. Not mainnet. Not a hosted production backend. Not custody of customer money. Cards and real USDC settlement are later, if ever.

Contact for a done-for-you setup: [pafka@hey.com](mailto:pafka@hey.com).
