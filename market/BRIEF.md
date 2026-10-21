# Brief for Alan: what we're building (14 Oct 2026)

**In one sentence:** you post a request like *"find me 30 Hyperliquid wallets that made over $10k in the last 30 days"*, lock the money up front, and pay only for the wallets a computer confirms are real. Wrong answers are refunded automatically.

## Why
- Most data tools charge for a subscription or credits, whether or not the answer is right. We charge only for answers that pass a check.
- A check only works if a computer can do it without opinions. Our first niche (European battery-storage companies) worked, but websites block robots and "is this company really doing storage?" is fuzzy. You also didn't find it exciting.
- On Hyperliquid every trade is public. Anyone can ask Hyperliquid's free public data service (its API) "how much did this wallet make?" and get the same answer. So the check is exact, free, and anyone can re-run it.

## The new niche: verified Hyperliquid wallet lists
Buyers are traders and small funds looking for wallets worth following, copy-trading apps, and the apps built on Hyperliquid that want active traders. People already pay for this kind of data: HyperTracker charges $179–$1,999 a month for Hyperliquid wallet data, and Nansen Pro is $49 a month. What nobody sells yet is *a custom list where you pay per wallet that checks out*.
We compared 5 options (wallet lists, project lists, smart-contract bug hunting, prediction-market resolution, paid data tasks for AI agents). Wallet lists won: easiest to check and closest to what you like. Bug hunting pays the most, but Immunefi dominates it. Full scores and sources are in RESEARCH.md, section 2.

## How it works
1. **The buyer** writes the rules (e.g. at least $10k profit, at least 20 trades, at least $50k in the account, last 30 days) and locks the budget.
2. **The worker** (our AI agent) finds wallets and says what it thinks each one made.
3. **The checker** asks Hyperliquid directly about every wallet. Each wallet gets **pass** (worker gets paid), **fail** (buyer refunded), or **needs review** (Hyperliquid didn't answer, so the buyer is refunded and the wallet is listed for a person to look at). If the worker exaggerates a number by more than 10%, that wallet fails.
4. Everyone gets a receipt that lists every wallet, every check, and why it passed or failed.

## Decisions (made for you, easy to change)
- **Price: $3 per verified wallet, $90 for a 30-wallet job.** This is a starting guess to test with real buyers, not a measured number. It is a fraction of a HyperTracker subscription, so one job is an easy yes.
- **Payment: USDC held by our contract on Base (escrow).** Crypto buyers already hold USDC, and "pay only for what passes" *is* the product. Limits: $100 max per job until the contract gets a security review. If a buyer can't pay in crypto, send a normal invoice and let the receipt decide the bill. Stripe isn't needed yet. Its stablecoin fee is 1.5% ([Stripe](https://stablecoininsider.org/how-to-accept-stablecoin-payments-on-stripe/)); we haven't checked whether it's available to an Estonian business.
- **Data accounts:** the checker needs **no paid account**, because Hyperliquid's data service is free. For the worker's web research, **Exa** works pay-as-you-go at $7 per 1,000 searches, with $10 of free credit every month and no card needed ([Exa pricing](https://exa.ai/docs/admin/pricing)). One job uses well under 1,000 searches, so we expect $0 this month. Tavily is the backup ($8 per 1,000; 1,000 free a month). Don't buy HyperTracker ($179/mo) unless the free route turns out too slow.
- The battery-storage version stays in the code as a second example.

## First real test (14 Oct, test money on a private test chain)
- **Where wallets come from:** Hyperliquid's own public leaderboard file (the data behind its leaderboard page). A program can download it for free: 47,261 wallets. It's not an official, documented service, so we only use it as a starting list. The checker re-checks every wallet using Hyperliquid's official data service.
- **Job:** 30 wallets at $3 each, so $90 locked. Rules: at least $10k profit actually taken in the last 30 days, at least 20 trades, and at least $50k in the account.
- **Result: 12 passed, 18 failed, 0 needed review.** The worker was paid $35.28, our 2% fee was $0.72, and the buyer got $54 back automatically.
- **Why so many failed:** the leaderboard counts profit on trades that are still open. Our rule only counts profit that has been taken. 10 wallets failed on that, 5 had too few trades, and 3 had too little money. Those are honest results under the buyer's rules, not checker mistakes.
- **A checker bug we fixed:** our first run wrongly failed 7 wallets for having "$0" in the account. Hyperliquid's newer "unified" accounts keep their money in a different place. The checker now reads both places.

## Update (14 Oct, later)
- **The worker now checks its own work first**, using the same rules as the checker. Latest run: 100 candidates, 48 passed the worker's own check, it sent 30, and **all 30 passed** ($88.20 paid to the worker, $0 refunded). Without the self-check it was 12 out of 30.
- **Honesty fix:** Hyperliquid's data service only keeps a wallet's newest 10,000 trades. For very active wallets, that means we can't see the whole month. These wallets are now marked "needs review" instead of passing, and the buyer isn't charged for them. 5 wallets in the earlier run were affected.
- **The web page** now has a form to request wallets and shows a results table (screenshot: `docs-wallets-screenshot.png`).
- **Audience:** independent traders and builders on X, not companies. OUTREACH.md now has 3 build-in-public posts, a 60-second demo video script, and a DM offering a free first list. All of them are drafts.

## This week
1. Record the 60-second demo video from the script in OUTREACH.md (local test chain, no real money).
2. Post the build-in-public posts, one every day or two. **You decide** whether and when; nothing has been posted.
3. Choose 5–10 Hyperliquid traders or builders on X for the free-first-list DM. We'll run their rules through the worker and checker by hand.
4. Build next: a "needs review" view a person can quickly approve or reject, and an option that counts profit on open trades for buyers who want it.

No real money, no keys, and nothing posted or sent.
