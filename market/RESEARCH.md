# Research: which product should Alan build? (written 2026-10-13, Tallinn)

Method: web search and fetch on 2026-10-13, plus Alan's own site, his X profile, and video transcripts already on the box.
Numbers come from the sources linked next to them. Where a number is from a third-party report, it says so. Nothing here is invented. If I couldn't check something, it's marked **unverified**.

---

## 1. Competitors

### A. Agent spend rails (Spendlock)
| Name | What it does | Traction / funding | Lesson for Alan |
|---|---|---|---|
| **x402** (Coinbase), https://www.x402.org, https://agenteconomy.to/x402 | HTTP 402 "pay per request" in USDC, so agents pay for APIs without accounts | ~192M cumulative txs and ~$41.9M settled as of 2026-10-12 (agenteconomy.to). But x402stats.io (July 2026) says only **~45% of volume is organic**, 173 wallets earned ≥$100 in 30 days, and the median seller made **$0.10**. Visa/Artemis: adjusted ~$19M, with ~4,000 wallets driving 90% (coinscoop.org). AWS CloudFront and WAF integration (coinbase.com blog) | The rails exist and are free. The **demand** is small and concentrated. Don't build another payment rail; build something people pay *through* the rails for. |
| **Catena Labs**, https://catenalabs.com | Regulated "agentic bank": spend limits, approved recipients, audit trails, stablecoins on 10 chains, MCP/CLI | $30M Series A (a16z crypto, Acrew) in May 2026, $48M total; applied for an OCC trust bank charter (The Block, 2026-05-20) | Catena is building *exactly* Spendlock's pitch ("humans set spending limits... audit trails") with a bank charter. **A solo bootstrapper can't win generic spend governance.** |
| **Skyfire**, https://skyfire.xyz | Agent wallets, KYA identity, spend limits, tokenized cards; Fastly edge partnership | $8.5M seed (TechCrunch 2024-08) | Identity + payment at the edge is a distribution play for big partners. |
| **Payman**, https://paymanai.com | Agents run real banking transactions on existing rails; started as "AI pays humans for tasks" | ~$6.8M raised; ~16 staff; backed by Visa, Coinbase Ventures, Circle (LinkedIn) | They pivoted toward selling to banks and credit unions. Generic agent payments turned into enterprise sales. |
| **Nevermined**, https://nevermined.io | Metering, pricing, and settlement for AI services across cards, crypto, x402 | Funding **unverified** in this session | Usage-based billing for agents is crowded too. |
| **Stripe Agentic Commerce**, https://docs.stripe.com/agentic-commerce | Agent checkout, Shared Payment Tokens, machine payments via MPP/x402 (private preview) | Stripe-scale | The incumbent owns "agent pays merchant." |
| **Crossmint**, https://www.crossmint.com | Agent wallets, virtual cards, stablecoin checkout | Funding **unverified** here | Wallet infrastructure is a commodity; build on it. |

**Takeaway on A:** generic "spend rails" is a funded, crowded category with regulated players (Catena) and giants (Stripe, Coinbase, Visa). As a stand-alone product for a solo founder, it's a red ocean. The *brakes* (caps, pause, refunds) are worth keeping as a **feature** of something narrower.

### B. Agent result / job markets
| Name | What it does | Traction | Lesson |
|---|---|---|---|
| **Virtuals ACP v2**, https://whitepaper.virtuals.io/acp | Onchain jobs: client funds USDC escrow, provider submits, evaluator approves or rejects. Split is 90% provider / 5% evaluator / 5% protocol | Live on Base | **The generic escrow-with-evaluator primitive already exists.** Its evaluation is binary (approve or reject the whole job). |
| **ERC-8183 "Agentic Commerce"**, https://eips.ethereum.org/EIPS/eip-8183 | Draft standard (Feb 2026; authors include Davide Crapis and the Virtuals team): Open, Funded, Submitted, Completed/Rejected/Expired; fee hook capped at 10% | Draft; Sepolia reference deploys | Copy the vocabulary and states so Alan's contract stays interoperable. The standard says nothing about **partial, per-item payment** or **how** to verify. That's the gap. |
| **ERC-8004 Trustless Agents**, https://eips.ethereum.org/EIPS/eip-8004 | Identity, reputation, and validation registries for agents | Draft | Later: write verifier results as reputation. |
| **Olas Mech Marketplace**, https://olas.network/mech-marketplace | Agents hire agents for services | Olas reports 14.78M agent-to-agent txs but only **$109,931 cumulative turnover** and **10 daily active mech agents** (per search summary of olas.network, 2026-10-13) | Lots of transactions, little money. Agent-to-agent demand is still thin. **Start with humans paying.** |
| **Bittensor**, https://bittensor.com | Subnets reward miners for ML outputs that validators score | ~64 active subnets (yellow.com research, via search) | The best "verifier pays producer" design at scale. The lesson: **the validator design is the product.** |
| **Gensyn**, https://www.gensyn.ai | Verifiable ML compute | Mostly pre-mainnet as of April 2026 (search summary) | Verification is hard; pick a result type where it's trivial. |
| **Fetch.ai / ASI**, https://fetch.ai | Agent framework and discovery | Token-heavy | Developer focus; little paid-result demand shown. |
| **Clay**, https://www.clay.com, and **Apollo**, https://www.apollo.io | B2B lead data and enrichment. Clay pulls together 150+ data providers; Apollo has its own 240M-contact database | Clay: ~$100M ARR late 2025, $7.1B valuation (Sept 2026 Series D, per search summary). Apollo: $49–119 per user per month | **This is where the money is**: people already pay a lot for lead lists. Their weakness: you pay for *credits or seats*, not for *leads that are correct*. Stale or wrong data is a common complaint about lead tools (my impression; not measured here). |
| Upwork / Fiverr for agents | Freelance marketplaces adding AI agents | **unverified** in this session | Marketplaces win on liquidity, which Alan doesn't have. Avoid two-sided cold start: be the first supplier yourself. |

### C. AI terminal for onchain markets
| Name | What / price | Lesson |
|---|---|---|
| **Nansen**, https://nansen.ai | Pro at **$49/mo annual** (down from $999/mo Professional); API credits and x402 calls from ~$0.01 | The incumbent cut prices 95%. A **€49 tier competes head-on with Nansen at the same price.** |
| **Arkham**, https://arkm.com | Core intel free; API is quote-based | Free tier sets user expectations. |
| **Surf / AskSurf**, https://docs.asksurf.ai/pricing | Crypto AI analyst; pay-per-call ($0.006/credit, chat $0.12–$1.20 per call) | AI crypto analysts already exist and sell to agents. |
| **Kaito**, https://pro.kaito.ai/pricing | Social and attention intel, Enterprise single seat $833/mo | The top end is taken by funded data companies. |
| **DeFiLlama**, https://defillama.com | Free, open data, the community standard | Free, great data sets the floor at $0. |

**Takeaway on C:** a data moat requires data infrastructure Alan doesn't have, and prices are collapsing. Not the bet.

### D. Parked: game economy and outcome prediction markets
Not researched deeply tonight (parked by brief). Polymarket proves people will put money behind outcomes, but outcome markets bring regulatory work (CFTC/EU) that doesn't suit a solo bootstrapper. Keep parked.

### Role models (from the brief)
- **Mailchimp**: bootstrapped, ~$800M revenue in 2020, sold to Intuit for ~$12B in 2021 (Forbes, Intuit press release). Lesson: serve small businesses something boring, priced simply, for years.
- **Hyperliquid / Jeff Yan**: no VC, ~11 people, >$900M profit in its second full year (PANews, Colossus). Lesson: a tiny team owning one **core primitive** (an onchain order book) better than anyone.

---

## 2. Zero to One

**The secret (what few people believe):** "AI agents paying each other" is mostly hype today (x402's organic share is ~45%, Olas turnover ~$110k). But **people already pay a lot for data that is often wrong** (Clay at $100M ARR, Apollo). The underused idea: **pay only for results a machine can check**, with the money locked up front. The agent is the *worker*; the *buyer* is a human founder for now, and agents can be buyers later.

**Small market to monopolize first:** *verified B2B lead lists in one niche Alan can judge*, for example European battery storage (BESS) and energy buyers (his own example). One result type (`company-leads/v1`), one niche, one price per verified lead.

**Proprietary advantage (the 10x part):** the verifier and its growing **rule set and record of rejections**. Every settled job adds labeled data on which leads were real. Today the rules are DNS and criteria checks; next come registry lookups (e.g. the Estonian e-Business Register), a public email or MX check, and website keywords.

**Network effects:** weak at first. Later, more jobs mean better verifiers, which attract more workers and more buyers. Be honest: this only kicks in with liquidity.

**Economies of scale:** verification is code, so its marginal cost is near zero.

**Brand:** "You only pay for leads that pass." The onchain escrow is the *proof*, not the pitch.

**The 7 questions:**
1. Engineering: is it 10x better? Pay-per-verified-item with automatic refunds is new for lead data. The verification itself is still shallow (v0). **Partial.**
2. Timing: stablecoins on Base are cheap, ERC-8183 is fresh, and agents can produce leads cheaply. **Yes.**
3. Monopoly: start small in one niche plus one result type. **Yes, if he stays narrow.**
4. People: solo, learning to code. **The risk.** Keep the system tiny.
5. Distribution: X (459 followers, checked 2026-10-13) and build-in-public. **Weak. He must sell by hand.**
6. Durability: the verifier rules and the record of rejections compound. **Plausible.**
7. Secret: see above. **Yes.**

**Where a solo bootstrapper can own something:** not the rail (Coinbase, Stripe, Catena), not the generic job escrow (Virtuals, ERC-8183), not the data terminal (Nansen). Alan can own **the verifier for one result type in one niche**, sold as "pay per verified result."

---

## 3. Alan's curiosity and ikigai (honest)

Sources I could access:
- **alanpafka.com** (fetched 2026-10-13): "Building and experimenting at the intersection of AI, agents, code, MCPs, product, design, taste, and onboarding." Twenty years of plant medicine and shamanic work; a Chinggis Khan reference; prayer. Book episodes listed: Emerson ("Foolish Consistency"), the Bhagavad Gita for founders, Jim DeKorne's *Psychedelic Shamanism*, Siddhartha after Jung, Carl Jung, *Smoke Signals* (marijuana history), *The Teachings of Don Juan*. The site says book episodes are now "for fun — not as my profession."
- **X @alanpafka** (API, 2026-10-13): "Father of two. 20 years plant medicine. Studying mechatronics. Building with AI and agents until I know what to ship." 459 followers, 1,558 posts.
- **Video "I'd Rather Build"** (https://youtu.be/2d089gJ6hoU; Whisper transcript on the box): he says building excites him more than book content; he started "CatalogMiner" with agents; he's played with code "for five years or something on and off"; he copied DHH's homepage code to learn GitHub; he's studying mechatronics; he said "judgment really matters... how are you gonna know what to build?" and "I should listen to my gut feeling."
- **DeKorne episode** (transcript on the box): the shamanic map of the soul.
- **"Vibration"** (https://www.youtube.com/watch?v=w_96TrgFflg): wordless singing over a still image. No words could be recovered, so I make no claims about its content.
- I did **not** watch other videos tonight. I didn't search for a separate YouTube channel page beyond these files.

| | |
|---|---|
| **Love** | Building with agents and code; inner work (shamanism, Jung, the Gita); markets and money as skin in the game; the game world (parked) |
| **Skill** | Taste, product and onboarding sense, storytelling and video, 20 years of reading people; *early* coding (GitHub, Cursor, some Ruby on Rails) |
| **Need** | Buyers want lists that are correct; agent builders want safe ways to spend |
| **Pay** | Founders and sales teams already pay for leads (Clay, Apollo). Per-verified-lead pricing is simple to sell |

Honest tension: his public identity is spiritual and media, but his stated energy is building. The product should be small enough that he can run it himself and talk about it publicly ("I only get paid when the robot says the lead is real" is a good story).

## 4. Circle of competence (Cursor)
Realistic within 90 days: JavaScript/TypeScript scripts, Next.js pages, reading and changing a 150-line Solidity contract with tests, calling APIs (DNS, registries, LLMs), deploying to Base Sepolia, running a small Postgres or SQLite.
Out of reach for now: writing new DeFi or matching engines, auditing contracts for big money, running validator networks, a regulated custody business, market-making.
**Rule:** keep the contract tiny and boring, put cleverness in off-chain verifier rules, and cap real money at tens of dollars until there's an audit.

## 5. Verdict
**Direction: merge A and B, but flip the emphasis.** Not "Spendlock, agent spend rails" (Catena, Stripe, and Coinbase own that). Instead: **Spendlock: pay-per-verified-result jobs**, starting with **one result type, verified company leads, in one niche (European energy and BESS buyers)**. The spend rails (budget cap, pause, refund on expiry, per-item payout) are the trust features *inside* it. This challenges the original recommendation: the result market is the product, and spend rails are a feature, not a company.

- **Why:** money already flows for leads; the verifier is a moat a solo builder can own; the onchain part is small and useful (escrow and refunds anyone can audit); it fits his love of agents, stablecoins, and markets.
- **First customer:** a small European energy, BESS, or solar installer, or a B2B founder in Alan's network who already buys leads. Alan himself (Elolyte, his own prospecting) is customer zero. Don't wait for agents to be buyers.
- **How it makes money:** (1) **v0 service**: Alan's worker agent *is* the supplier, so he keeps the full per-lead price (e.g. €2–5 per verified lead). (2) **Protocol fee**: 2% on jobs when outside workers deliver. (3) Later: paid verifier rule packs per niche.
- **First $1k path:** 5 buyers × 100 verified leads × ~$2 = $1,000. Get there by DMing 30 founders or sales leads in energy and BESS, offering "100 verified leads, pay only for the ones that pass, money back automatically," and delivering with his own worker plus manual QA. Payment can be USDC escrow, *or* an invoice while buyers aren't onchain (the verifier report still decides the bill). **Unverified assumption:** buyers will pay ~$2–5 per lead in this niche. Test it in the first 10 conversations.

---

## 2. Niche re-pick (2026-10-14): closer to crypto and agents

Alan doesn't find the BESS niche exciting, so we kept the core idea (pay only for results a machine can check) and compared 5 crypto/agent niches. Scores are 1–5 (5 = best). Figures come from the linked sources, checked 2026-10-14. Scores are our own judgement.

| Candidate | Can a machine check it? | Do buyers pay? (evidence) | Alan's excitement | Competition (5 = little) | First $1k path | Total |
|---|---|---|---|---|---|---|
| **A. Verified Hyperliquid wallet lists** ("30 wallets with ≥$10k realized PnL and ≥20 trades in 30 days") | **5**: every number is re-computed from Hyperliquid's free public info API (`clearinghouseState`, `userFillsByTime`) ([docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)). Tested live from the box today | 4: HyperTracker sells Hyperliquid wallet/leaderboard API access at $179–$1,999/mo ([pricing](https://docs.coinmarketman.com/endpoints/rate-limits-and-pricing)). Nansen Pro is $49/mo (RESEARCH §1C). Builders earned $90.7M across 1,411 builder codes ([CoinMarketMan](https://coinmarketman.com/blog/how-hyperliquid-builder-codes-actually-split-revenue--en/)), so frontends and copy-trading tools have money and want good wallets | 5: Hyperliquid | 3: dashboards exist (HyperTracker, Nansen), but they sell seats and data. Nobody sells "a custom list, paid per wallet that passes" | 4: 10 custom jobs × ~$100 to traders, copy-trading builders, small funds | **21** |
| B. Verified Hyperliquid/HIP-3 ecosystem project lists (team, live site, onchain activity) | 3: onchain part checkable; "is this a real team" is not | 3: BD and fund analysts buy lists (Clay ~$100M ARR, §1B), crypto-specific demand not measured | 4 | 3 | 3 | 16 |
| C. Verified smart-contract bugs/test results | 4: a failing test or exploit PoC proves itself | 5: Immunefi has paid researchers **$143.2M** all-time, $802k in Aug 2026 alone ([Immunefi Aug 2026](https://docs.immunefi.foundation/august-2026-immunefi-ecosystem-update/)) | 4 | **1**: Immunefi dominates. It paid more than all other platforms combined ([review](https://mitchellamador.com/p/bounty-pools-are-marketing-payouts)); Sherlock, Cantina, HackenProof too | 2: needs elite security skill to get the first bounty | 16 |
| D. Verified prediction-market resolution data | 2: the hard cases are about how rule wording is read, not data. 52% of UMA disputes in a recent window were "too early" ([Bitquery](https://bitquery.io/investigations/who-decides-polymarket-disputes)); the Strategy BTC sale case turned on interpretation ([CoinDesk](https://www.coindesk.com/markets/2026/06/04/polymarket-says-no-for-may-yes-for-june-after-strategy-s-recent-bitcoin-sale)) | 3: disputes use $500–750 bonds ([Polymarket docs](https://docs.polymarket.com/concepts/resolution)), but the buyer is a protocol, not a customer | 5 | 2: UMA, Chainlink, and Polymarket's V2 oracle aggregator (from 2 Nov 2026 if the date holds, per Bitquery) | 1 | 13 |
| E. Verified data-labeling/research tasks paid to agents | 2–3: depends on the task; often needs a human or a second model | 2: agent-to-agent demand is thin (Olas: $109,931 cumulative turnover, §1B) | 4 | 2: Scale-type incumbents plus Virtuals ACP | 2 | 12 |

**Pick: A, verified Hyperliquid wallet lists.** It is the only one where *100%* of the check is a free, public, deterministic API call. There are no blocked web pages and no "needs review" because of a JS homepage, which is exactly where BESS leads struggled. It is also in Alan's favourite market. Plan B, if wallet buyers don't bite: B (ecosystem project lists), which reuses the company-leads rules we already have.

What the worker must deliver per wallet: `address`, optional `label`, and its claimed PnL and trade count. The checker re-computes everything and fails the wallet if a claim is off by >10%, so a worker can't pad its numbers.
Caveat: realized PnL from fills is a simple metric (closed PnL minus fees). It ignores open positions and funding. Good for v1; add funding and unrealized PnL later if buyers ask.
