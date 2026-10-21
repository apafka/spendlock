# Outreach for X: DRAFTS ONLY, nothing has been sent
Alan posts and DMs these himself, from his own account, after review. Every number below comes from our own local test runs (test money on a private test chain). Change the numbers if a newer run differs.

## Who it's for
Independent builders and traders on X, not companies:
1. **Hyperliquid traders** who want a list of wallets worth watching, checked rather than taken on trust from screenshots.
2. **Builders of copy-trading bots, Telegram bots, and dashboards** on Hyperliquid who need a starting set of wallets.
3. **Agent builders** who'd like to *buy* a verified result per item instead of scraping it.
4. **Crypto researchers and newsletter writers** who post "top wallet" threads.

## Build-in-public posts (3 drafts)

**Post 1: the idea**
> Most data tools charge you whether the answer is right or not.
>
> I'm building the opposite: you lock USDC, an AI agent finds results, and a checker verifies each one. You pay only for what passes. The rest is refunded automatically.
>
> First use case: Hyperliquid wallets. Everything onchain is public, so a machine can check every claim. 🧵

**Post 2: the honest numbers**
> Day 1 of "pay per verified result" on Hyperliquid wallets:
>
> Asked for 30 wallets with $10k+ realized PnL, 20+ trades, $50k+ account (last 30d).
> Run 1: the agent submitted raw leaderboard wallets → 12 passed, 18 refunded.
> Why: the leaderboard counts unrealized PnL. The checker doesn't.
> Run 2: the agent pre-checks itself → 48 of 100 candidates pass its own check, it submits 30, and all 30 pass (0 refunded).
>
> The checker is the product.

**Post 3: the bug I caught**
> Found a bug in my own checker today: 5 "passing" wallets had exactly 10,000 trades.
>
> That's the max history Hyperliquid's API returns, so their 30-day PnL was incomplete. Those wallets now go to "needs review" and the buyer gets that money back.
>
> I'd rather refund than pay for a number I can't prove.

## 60-second demo video script (wallet flow)
Screen recording of the web page on the local test chain, with Alan's voice-over.

| Time | On screen | Voice-over |
|---|---|---|
| 0–5s | Title page: "Spendlock · pay per verified result" | "What if you only paid for data that's actually correct?" |
| 5–15s | Wallet form: 30 days, $10k PnL, 20 trades, $50k account, 30 wallets × $3 | "I want 30 Hyperliquid wallets that made at least ten thousand dollars in the last month. Ninety dollars, locked up front." |
| 15–22s | Click "Post & fund job"; status shows funded | "The USDC goes into a contract, not to anyone yet." |
| 22–35s | Terminal: worker pre-check, then submit | "An AI agent scans a hundred candidates from the public leaderboard and checks them itself before submitting." |
| 35–48s | Terminal: checker lines (✔ / ? / ✘) | "Then an independent checker asks Hyperliquid directly about every wallet: profit, trades, account size." |
| 48–57s | Results table, green / yellow rows | "Green ones get paid. Anything it can't prove, like wallets past the API's history limit, goes back to me." |
| 57–60s | Settlement line ($ to worker / refund) | "Pay per verified result. Want a free first list? DM me." |

## DM template: free first job
> Hey {name}, saw your {post/bot/dashboard} on Hyperliquid. I'm building a tool where an agent finds wallets that match your rules (e.g. 30-day realized PnL, trade count, account size) and every wallet is re-checked against Hyperliquid's own API before it counts.
>
> Want a free first list? Tell me your rules and I'll send up to 30 checked wallets with the numbers for each one. No payment, no catch. I'm just testing whether this is useful.
> — Alan

Follow-up (once, after 4 days):
> Quick bump. Happy to run that free wallet list if it's useful. Just send me your rules.
