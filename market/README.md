# Market: pay per verified result

Snapshot of the pay-per-verified-result market (git archive of HEAD `7f668f2`, 2026-10-21). It lived on one build machine and is imported here so it is versioned. Layout is unchanged: `agents/`, `contracts/`, `web/`, `game/`, plus the original docs and demo scripts.

This tree is **local anvil / testnet play money only**. Do not deploy to any public network from here, do not commit real keys, and do not put real USDC in these contracts. The contracts are unaudited.

It sits next to the company Spendlock slice at the repo root (`contracts/`, `agents/`, `web/`) and is **not merged** with those files. Root already has a Spendlock vault + ResultEscrow; `market/contracts/` is a parallel copy from this snapshot.

## Run each demo locally

Needs Node 20+ and Foundry (`forge`, `anvil`). Install once from the repo root; run the demos from `market/`.

```bash
# once, from the repo root
curl -L https://foundry.paradigm.xyz | bash && foundryup
cd market/agents && npm install
cd ../web && npm install   # only for the job form / fantasy UI
```

| What | Command (from `market/`) | Notes |
|---|---|---|
| Offline tests | `cd agents && npm test` · `cd game && npm test` · `cd contracts && forge test` | Expected 13 / 7 / 43. Agents tests start their own anvil + fake Hyperliquid API. |
| Full job lifecycle | `./demo.sh` | Local anvil: BESS job + synthetic failures, printed balances. |
| Verified wallets | `./demo-wallets.sh` | Local anvil; worker/verifier call the public Hyperliquid API. |
| Agents buy via MCP | `./demo-mcp.sh 5` | Demo agent buys 5 verified wallets. |
| Agents buy via HTTP 402 | `./demo-x402.sh 5` | x402-style quote → escrow pay → report. Local only. |
| Spendlock vault demo | `./demo-spendlock.sh` | Caps, allowlist, kill switch; refunds return to the vault. |
| Web job form | terminal 1: `anvil` · terminal 2: `cd agents && node deploy.js` · terminal 3: `cd web && npm run dev` | http://localhost:3000 — use the local test account. |
| Fantasy league | `cd game && npm test` | Offline, fake API. Live pool/UI needs Hyperliquid + `cd web && npm run dev` → `/game`. Points only, no keys. |

The rest of this file is the original snapshot README (paths are relative to `market/`).

---

# Spendlock v0: pay per verified result

A buyer locks USDC for a job ("10 European energy companies, $4 each"). A **worker agent** delivers a list.
A **verifier agent** checks every item with rules a machine can run, and the smart contract pays **only for the items
that pass**. The protocol takes a 2% fee, and the rest goes back to the buyer automatically.

```
 buyer (web page or post-job.js)          worker.js                 verifier.js
   │ approve + createJob ──► [ ResultEscrow contract holds $40 ]
   │                                  ◄── submitResult(hash of lead file)
   │                                                  checks DNS, country, duplicates
   │                                  ◄── settle(job, 7 verified)
   ▼
 buyer gets $12 back · worker gets $27.44 · fee $0.56
```

Default chain: a **local test chain (anvil)**. Base Sepolia (testnet) and Base mainnet are one setting away (`NETWORK=`). See NEXT.md.

## Run it (about 5 minutes)

You need: Node 20+, git, and Foundry.
```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup   # installs forge + anvil
cd agents && npm install && cd ../web && npm install && cd ..
(cd contracts && forge install foundry-rs/forge-std --no-git)  # only if contracts/lib is empty
./demo.sh            # tests + local chain + full job lifecycle, prints balances
```
The output from my run is in `demo-output.txt`.

### Try the web page
```bash
anvil                                  # terminal 1: local blockchain
cd agents && node deploy.js            # terminal 2: deploy contracts
cd web && npm run dev                  # terminal 3: http://localhost:3000
```
Click **Use local test account**, then **Post & fund job**. Then in terminal 2:
`node worker.js --job <id> && node verifier.js --job <id> && node balances.js` (the page prints the exact command; `--job` is required, there is no shared "latest" job). Click ↻, then **Results** on the settled job to see each lead's pass or fail reason (screenshot: `docs-results-screenshot.png`).

## Folder map
| Path | What it is |
|---|---|
| `contracts/src/ResultEscrow.sol` | **The money logic** (~150 lines). Read this first. |
| `contracts/src/MockUSDC.sol` | Fake USDC for local tests only |
| `contracts/test/ResultEscrow.t.sol` | 14 tests, including a fuzz test showing money is never lost or stuck |
| `contracts/script/Deploy.s.sol` | Optional Foundry deploy script |
| `agents/config.js` | **The one switch**: which network, which wallets, the safety caps |
| `agents/deploy.js` | Deploys contracts, writes `deployments/<network>.json` |
| `agents/post-job.js` | Buyer agent: approve USDC and create the job |
| `agents/worker.js` | Worker agent: builds the lead list from a CSV (default `data/bess-candidates.csv`, 27 real BESS players with a source URL per row) and submits its hash |
| `agents/data/bess-spec.json` | Real job spec: countries, price, and **rules** (homepage keywords, evidence source) |
| `agents/data/candidates.csv` + `demo-spec.json` | Tiny synthetic list with planted bad rows (fake domain, duplicate) to show failures |
| `agents/data/jobs/<id>.report.json` | The receipt: every item, every rule, pass/fail and why (its hash is onchain) |
| `agents/leadRules.js` | **The verifier rules** (your future moat) |
| `agents/checklist.js` | Go-live checklist for Base Sepolia/mainnet: prints what's missing; never uses keys |
| `agents/verifier.js` | Checks file hashes, runs the rules, writes a report, settles onchain |
| `agents/buy.js` | The buy pipeline (feed → escrow → worker → checker → settle) shared by the MCP server and the x402 endpoint. One folder per order, files keyed by onchain job id, so buys can run in parallel |
| `agents/mcp-server.js` | MCP server: agents buy verified wallet lists as a tool call |
| `agents/x402-server.js` + `x402-agent-client.js` | x402-style HTTP endpoint (402 → pay into escrow → retry with `X-PAYMENT`) and a sample buyer agent. Local anvil only |
| `agents/concurrency.test.js`, `agents/x402.test.js` | Offline end-to-end tests (own anvil + fake Hyperliquid): two buys at once; 402/pay/replay |
| `agents/leadRules.test.js` | Offline tests for the rules (`node --test`) |
| `web/app/page.tsx` | The whole UI in one file |
| `web/app/api/*` | Tiny server routes: config (addresses + ABIs), spec (save job criteria), report (verifier results) |

## Beginner walkthrough (read in this order)

**1. The contract (`ResultEscrow.sol`).** A contract is a program that holds money and can only do what its code allows.
- `createJob(...)`: computes `budget = maxItems * pricePerItem`, checks the **brakes** (`paused`, `maxJobBudget`), then
  `transferFrom` pulls the USDC in. You must `approve` first. That's how ERC-20 tokens work: you give permission, then the contract pulls.
- `submitResult(jobId, resultHash)`: the worker doesn't upload the file onchain (too expensive). It stores a **hash**,
  a fingerprint. If anyone changes the file later, the hash won't match.
- `settle(jobId, verifiedCount, reportHash)`: only the job's `verifier` can call it. The math:
  `earned = verified × price`, `fee = earned × 2%`, `worker gets earned − fee`, `buyer gets budget − earned`.
- `refundExpired`: if nobody settles before the deadline, the buyer gets everything back. Money can't get stuck.
- USDC has **6 decimals**: `1_000_000` = $1.00.
- Notice the pattern "change state first, move money last." It's a standard safety habit.

**2. The tests (`ResultEscrow.t.sol`).** `vm.prank(addr)` means "the next call comes from addr." `vm.warp` moves time.
`testFuzz_conservation` runs 256 random jobs and checks that every cent ends up with the buyer, worker, or fee wallet.
Run: `cd contracts && forge test -vv`.

**3. The agents (`agents/`).** Plain JavaScript using **viem** (a library for talking to Ethereum-style chains).
`writeContract` sends a transaction, `readContract` reads, and `waitForTransactionReceipt` waits until it's mined.
Everything reads `config.js`, so changing `NETWORK` changes everything.

**4. The verifier rules (`leadRules.js`).** For each lead it runs checks in order and records each one as `{rule, ok, detail}`:
has a company name, the domain is well-formed, no duplicate, the country is allowed, not on the exclude list, and a real DNS record
(Cloudflare DNS over HTTPS). Then come the optional rules from the job spec: a homepage keyword, a source page that names the company, and a source page that mentions BESS.
Each item ends as **pass** (paid), **fail** (clear negative evidence, refunded), or **needs review** (pages blocked so nothing could confirm it, refunded and listed separately). A blocked page means "unknown," never "no". The site check tries the homepage and subpages like /projects and /storage. The deciding check becomes the item's `reason`. `verifier.js` saves all of it in `data/jobs/<id>.report.json`, and the web page shows it under **Results**. **This file is where the product gets better**: add business registry checks, email
MX checks, and LinkedIn or website signals. Each new rule makes leads more trustworthy.

**5. The web page (`web/app/page.tsx`).** Loads config from `/api/config`, connects MetaMask or Coinbase Wallet (or the local
test account), and does the same `approve` → `createJob` steps as `post-job.js`, then lists jobs.

## Honest limits of v0
- **The verifier is trusted.** It's one wallet you control. Fine for v0, since you are the verifier. See NEXT.md.
- Job, result, and report files live in `agents/data/jobs/` on one machine, not IPFS or a database. The worker and verifier must share that folder.
- The worker is "dumb": it filters a CSV. The BESS set (27 rows) was hand-collected from public news on 2026-10-13. Company domains were matched by me, and the verifier checks them live; `e-energija.lt` for E energija Group is my best match (homepage title "E-energija"). These are developers, owners, and investors in BESS, not confirmed *buyers of anything Alan sells*.
- Some news sites block bots, so the source rules produce false negatives (see NEXT.md).
- The contract is **unaudited**. Keep real money tiny (the defaults cap it at $20 per job on mainnet).

## Agents buy over MCP
`./demo-mcp.sh 5` starts a local chain and has a demo agent buy 5 verified Hyperliquid wallets through the MCP server. To plug it into Cursor, add a stdio server: `{"mcpServers":{"verified-results":{"command":"node","args":["market/agents/mcp-server.js"],"env":{"NETWORK":"local"}}}}` (needs a running anvil with `node deploy.js` done first).

## Agents buy over HTTP (x402-style)
`./demo-x402.sh 5` starts a local chain, the endpoint on `http://127.0.0.1:4020/v1/hl-wallets`, and a sample agent (`agents/x402-agent-client.js`, anvil dev account #4).
1. `POST /v1/hl-wallets?count=5[&minTrades=50&minRealizedPnlUsd=…&minAccountValueUsd=…&windowDays=…]` with no payment → **HTTP 402** with an x402 v1 body: `accepts[0]` has `scheme: "escrow"`, `maxAmountRequired` (USDC units), `asset` (USDC), `payTo` (the escrow), and in `extra` the exact `createJob` arguments, the spec text, and its `specHash` (it includes a one-time `quoteId`).
2. The agent checks the terms, approves USDC, and calls `createJob` on the escrow itself.
3. It repeats the request with `X-PAYMENT: base64({x402Version:1, scheme:"escrow", network:"anvil-local", payload:{quoteId, jobId, txHash}})`. The server checks the job onchain (amount, price, verifier, spec hash, Open, deadline ≥ 1 h), redeems the quote once, runs the pipeline, and answers **200** with the verified report plus `X-PAYMENT-RESPONSE` (settle tx, paid, refund).
Why escrow instead of x402's plain `exact` transfer: the buyer pays only for wallets that pass, and the contract refunds the rest straight to the buyer. A replayed `X-PAYMENT` gets 402 `quote already redeemed`. If delivery fails, the USDC stays in escrow and the buyer can call `refundExpired` after the deadline. The server refuses to start unless `NETWORK=local`.

## Spendlock vault: spend limits for agents
`./demo-spendlock.sh` runs the onchain spend rails on a local chain: an owner funds a USDC vault and gives agents per-tx, daily, budget, allowlist and expiry rules, with owner approval for big spends and a kill switch. Agent A buys verified wallets through ResultEscrow from its allowance, and refunds go back to the vault. Agent MCP tools: `agents/spendlock-mcp.js`. Dashboard: `/spendlock`. Plain-English guide: [SPENDLOCK.md](SPENDLOCK.md).
