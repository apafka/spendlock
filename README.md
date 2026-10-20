# Spendlock

Hard spend rails for small founder agent teams: per-agent caps, a daily limit, a recipient allowlist, owner approval above a threshold, a kill switch, and a readable spend log.

Broad agent-payment platforms want to be the bank, the identity layer, and the marketplace. Spendlock is Basecamp-simple: **one dashboard, hard caps, allowlist, kill switch, readable log.**

- Settlement rail: **USDC on Base**. Testnet / local play money only. **No mainnet. No token. No real funds in this repo.**
- Business: bootstrapped monthly team plan (placeholder **EUR 29–99**) plus paid setup installs (**from EUR 500**) for founders whose agents already spend.
- The contract is **unaudited**. Never put real money in it.

## What’s in this repo

| Path | What it is |
|---|---|
| `web/` | Founder landing page (`/`) and a **no-wallet interactive demo** (`/demo`) |
| `contracts/` | `Spendlock.sol` vault + Foundry tests (and ResultEscrow, which the vault can pay) |
| `agents/` | MCP tools (`spendlock_status`, `spendlock_spend`) and an owner CLI |
| `SPENDLOCK.md` | Plain-English guide to the onchain rules |

`main` was an empty stub. This slice brings in the local prototype (vault, tests, MCP, owner CLI) and adds the landing page plus a simulated demo so anyone can click the rails without keys.

## Run the demo (no wallet)

```bash
cd web
npm install
npm run dev
```

- [http://localhost:3000](http://localhost:3000) — landing (headline, why now, pricing)
- [http://localhost:3000/demo](http://localhost:3000/demo) — owner dashboard, simulated in the browser

On the demo you will see three agents with per-agent caps. Try, in any order:

1. **Over the cap: $12** — Agent B is limited to $10 per payment → blocked
2. **Pay a stranger $3** — Agent A may only pay ResultEscrow → blocked
3. **Ask owner: $8 data feed** — Agent B’s threshold is $5 → waits for you to Approve or Reject
4. **KILL SWITCH** — every agent frozen; the next spend is rejected

Every action is a row in the plain-English log. Reset demo restores the seed. State lives in `localStorage` (`spendlock.demo.v2`).

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

A founder can give each Cursor agent its own policy on the vault, then point that agent at the MCP server. The model only gets two tools. The **contract** still says no.

```json
{
  "mcpServers": {
    "spendlock": {
      "command": "node",
      "args": ["agents/spendlock-mcp.js"],
      "env": {
        "NETWORK": "local",
        "SPENDLOCK_RPC": "http://127.0.0.1:8545",
        "SPENDLOCK_VAULT": "0x…",
        "SPENDLOCK_AGENT_KEY": "test-key-for-this-agent-only"
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

- `spendlock_status` — remaining per tx / today / budget, pause, kill switch, pending requests
- `spendlock_spend` — `{ to, amountUSDC, memo }` → `executed`, `pending` (owner must approve), or `rejected` with the reason

Owner side: `node agents/spendlock-owner.js status` (and `policy`, `allow`, `pause`, `kill`, `approve`, `reject`).

Use a **local anvil or Base Sepolia** vault. Put a test key in env, not in git. The MCP refuses mainnet chain ids. If a cloud agent is prompt-injected, it still cannot spend past the cap, off the allowlist, or through a kill switch.

## What this is not

Not a token. Not a bank. Not mainnet. Not a hosted production backend. Cards and real USDC settlement are later, if ever.

Contact for a done-for-you setup: `TODO@example.com` (placeholder).
