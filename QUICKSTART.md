# Spendlock quickstart

Spend limits your agent can't turn off.

Five minutes. Local play money. No wallet app. No call with us. The vault is **unaudited** — never put real funds in it. Mainnet deploys are refused.

## What you get

One command starts:

- a local chain (anvil), or Base Sepolia if you pass your own RPC and test key
- a Spendlock vault funded with mock / test USDC
- one agent profile (`scout`) with default limits
- the three local x402 sellers from this repo
- an MCP snippet to paste into Cursor or Claude Desktop

Then your agent can call `spendlock_status` and `spendlock_pay`. Caps, the approval queue, and the kill switch live **outside** the agent.

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `anvil`) — `./quickstart.sh` installs it into `~/.foundry` if you are at a terminal

## 1. Clone and run

```bash
git clone https://github.com/apafka/spendlock.git
cd spendlock
./quickstart.sh
```

Equivalent: `npm run quickstart`.

Leave that terminal open. You should see something like:

```
Spendlock — spend limits your agent can't turn off.
Local / testnet play money only. The vault is unaudited. No mainnet.

network   local
rpc       http://127.0.0.1:8545
vault     0x...
token     0x...  (MockUSDC)
funded    $1000
agent     scout  0x70997970C51812dc3A010C7d01b50e0d17dc79C8
limits    $5/tx  $50/day  $100 budget
approval  auto-approve under $0.1  →  $0.02 pays, $0.50 waits, $25 blocked

Sellers (leave this process running so they stay up)
  Price feed         $0.02   http://127.0.0.1:4021/v1/price
  Company data       $0.5    http://127.0.0.1:4022/v1/company
  Expensive dataset  $25     http://127.0.0.1:4023/v1/dataset
```

`scout` is the one profile the command creates. Auto-approve is set under **$0.10** on purpose so the three demo sellers show all three outcomes. Raise it to `$50` when you point a real agent at this vault:

```bash
SPENDLOCK_DATA_DIR=.spendlock/data node agents/spendlock-owner.js profile scout Scout 5 50 100 50
```

Anvil keys printed below are Foundry's well-known **public** test keys. They are not generated into the repo. Never use them on a network with real funds.

## 2. Paste the MCP config

The command prints a JSON block. Paste it into:

- **Cursor:** Settings → MCP → add a stdio server (or merge into `~/.cursor/mcp.json`)
- **Claude Desktop:** `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS

Expected shape (addresses and ports come from your run):

```json
{
  "mcpServers": {
    "spendlock": {
      "command": "node",
      "args": ["/absolute/path/to/spendlock/agents/spendlock-mcp.js"],
      "env": {
        "SPENDLOCK_MODE": "vault",
        "NETWORK": "local",
        "SPENDLOCK_RPC": "http://127.0.0.1:8545",
        "SPENDLOCK_VAULT": "0x...",
        "SPENDLOCK_AGENT_KEY": "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
        "SPENDLOCK_DATA_DIR": "/absolute/path/to/spendlock/.spendlock/data"
      }
    }
  }
}
```

A copy (including the local anvil key) is written to **gitignored** `.spendlock/mcp.json`. Restart Cursor / Claude Desktop after pasting so it picks up the server.

## 3. Ask your agent

Use the seller URLs from the quickstart output.

| You say | Expected |
|---|---|
| `spendlock_status` | Vault funded, kill switch off, one profile `scout`, remaining `$5` / `$50` / `$100` |
| `spendlock_pay` agent `scout` url *price feed* | `"outcome": "paid"` · `$0.02` · price tick JSON |
| `spendlock_pay` agent `scout` url *dataset* | `"outcome": "blocked"` · `"reason": "over per-tx cap"` |
| `spendlock_pay` agent `scout` url *company data* | `"outcome": "pending"` · waiting for owner approval |

Approve the queued pay (second terminal; leave `./quickstart.sh` running):

```bash
SPENDLOCK_DATA_DIR=.spendlock/data node agents/spendlock-owner.js queue
SPENDLOCK_DATA_DIR=.spendlock/data node agents/spendlock-owner.js approve 1
```

Expected after approve: `"outcome": "paid"` · `$0.50` · company snapshot JSON.

That is the whole product: the agent can ask, the vault can say no, and the owner can say yes. The agent cannot raise its cap or skip the queue.

## 4. Scripted run (no chat client)

Proves the same three outcomes without Cursor:

```bash
./quickstart.sh --verify
```

Expected last lines:

```
MCP story
  price feed $0.02             paid · $0.02
  expensive dataset $25        blocked · $25 · over per-tx cap
  company data $0.50           pending · $0.5 · asks owner above $0.1 · request #1
  owner approved $0.50         paid · $0.5
OK paid / blocked / waiting-for-approval
```

CI runs this on anvil so the path cannot silently break.

## Base Sepolia

Local is enough to try Spendlock. To put the vault on Base Sepolia (still play / test USDC, still no mainnet):

1. Get a Base Sepolia RPC and a **test** key you control. Put them in the environment — never in git.
2. Fund that key with Sepolia ETH (gas) and [Circle test USDC](https://faucet.circle.com/) on Base Sepolia (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`).
3. Run:

```bash
export NETWORK=base-sepolia
export SPENDLOCK_RPC=https://sepolia.base.org   # or your own RPC
export OWNER_PRIVATE_KEY=0x...                 # test key only
export SPENDLOCK_AGENT_KEY=0x...               # a second test key, or the same one
./quickstart.sh
```

The command deploys the vault against Circle's test USDC, sets the `scout` policy, allowlists the three **local** mock sellers, and prints an MCP snippet. Your private key is **not** printed; copy it from your environment or from gitignored `.spendlock/mcp.json`.

If the owner wallet has less than $1000 test USDC, deploy still succeeds and the command tells you to fund the vault after the faucet. The mock sellers stay on localhost — this is a testnet vault plus local 402 endpoints, not a public seller.

## Safety

- Testnet and local only. The process refuses mainnet chain ids.
- No real funds. MockUSDC on anvil; Circle test USDC on Base Sepolia.
- No keys committed. Anvil defaults are public test keys. Your Sepolia keys stay in env.
- Ctrl+C stops anvil and the sellers. State lives in `.spendlock/` (gitignored).

More on the rules: [SPENDLOCK.md](./SPENDLOCK.md).
