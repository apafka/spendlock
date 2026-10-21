# Spendlock: review, Wed 14 Oct 2026, 10:00 Tallinn

## What it is (one line)
**Pay only for results that pass a machine check.** A buyer locks USDC for a job ("30 European BESS companies, $2 each"). An agent delivers, a verifier checks every item, and the contract pays per passed item and refunds the rest automatically. The protocol takes 2%.

## Why this, not the others (verdict)
- Generic agent spend rails are crowded and funded: Catena Labs ($48M, a16z crypto, applying for a bank charter), Stripe, Coinbase x402, Skyfire.
- Generic job escrow already exists (Virtuals ACP, the draft ERC-8183), but only as pass/fail for the whole job, with no built-in checking.
- Real money is in lead data (Clay ~$100M ARR reported); buyers pay for credits, not correctness.
- **The gap a solo builder can own:** per-item payment plus *the checking rules for one niche*. Start with European BESS and energy-storage companies.
- The onchain terminal (Nansen is now $49/mo) and the game stay parked.

## Demo (3 minutes): `./demo.sh`, output in `demo-output.txt`
1. 14 contract tests and 5 rule tests pass, including a fuzz test showing no money is ever lost or stuck.
2. A local chain starts and contracts deploy. The buyer locks **$60** (30 × $2).
3. The worker submits **27 real BESS players** (Sunly, Evecon, Ingrid Capacity, Nala, Delta Capacity, Grenergy, Zenobē…), each with a public source URL.
4. The verifier checks, live: DNS, a storage keyword on the homepage *or* subpages (/projects, /storage, …), and whether the source page names the company and mentions BESS. A blocked page counts as **"unknown"**, not "no". Result: **25 pass · 2 needs review · 0 fail**. Needs review covers Enefit (no keyword on 8 site pages, source blocked) and Ignitis (site and source both block bots). Both are refunded and listed for a human.
5. Settlement: worker **$49.00**, fee **$1.00**, buyer refund **$10.00** (3 unfilled slots + 2 review items), escrow $0.00.
6. Job #2 has planted bad rows: a fake domain fails DNS and a duplicate is caught. Then open the web page → **Results** to see a green/red table with reasons (`docs-results-screenshot.png`).

Honest caveats: the first run wrongly rejected 7 real BESS players (blocked news sites, generic homepages). The three statuses (pass / fail / needs review) and the subpage fallback fixed 5 of them and moved 2 to review. Passing still means "a public trace of storage activity," not "confirmed buyer". The verifier is one trusted wallet. Nothing is on a real network yet. The contract is unaudited.

## Decisions (options and my recommendation)
| # | Decision | Options | Recommend |
|---|---|---|---|
| 1 | Product framing | (a) Spend rails company (b) **Pay-per-verified-result, rails as features** (c) Terminal | **b** |
| 2 | First niche | (a) **European BESS/storage developers** (b) Baltic energy only (c) a niche where Alan knows 10 buyers | **a**, narrowed to Baltics + Nordics first (closest to him; ~15 of the 27 rows already have Baltic or Nordic projects) |
| 3 | Verification rules | A only / **A+B+D (D accepts source or homepage) + E per buyer** / all five | **A+B+D+E** (see NEXT.md) |
| 4 | Price per verified lead | $1 / **$2–5** / $10+ with contact person | **$3** to start; test in first 10 conversations |
| 5 | How first customers pay | (a) USDC escrow onchain (b) **invoice/Stripe, with the verifier report deciding the bill** (c) both | **c**: offer escrow, accept invoice. Don't block sales on crypto |
| 6 | Who the first buyer is | BESS developers / **suppliers selling *to* BESS developers (EPC, integrators, inverters, insurers, lawyers)** / investors | **Suppliers**: they need lists of developers. Developers are the *leads*, not the buyers |
| 7 | Go testnet this week? | Yes / later | **Yes**: Alan creates 4 fresh wallets himself, then runs `node agents/checklist.js` until it's all ✔ (it lists exactly what's missing and never reads key values) |
| 9 | Who clears "needs review" | Refund forever / **Alan reviews by hand, paid in a follow-up job** / auto-retry later | **Manual review** for now; it's also how new rules get found |
| 8 | Name | Spendlock / a results-style name | Keep Spendlock until first $; rename costs nothing later |

## This week (if approved)
Mon–Tue: send 20 outreach DMs (draft in `OUTREACH.md`). Wed: Base Sepolia deploy by Alan. Thu: add a second source per lead to shrink needs review. Fri: first paid pilot (100 leads).
