# Research: fantasy / competitive trading games (checked 2026-10-19)

Short and sourced. Figures are what each site states about itself, not verified by us.

## What exists
| Product | What it is | Takeaway for us |
|---|---|---|
| **Crypto Fantasy League (CFL)** — cfl.fun | Pick up to 5 *tokens*; squads win on price moves. Modes from 30-second "Rush" to monthly cups; paid entries, prize pools. Site claims 36,500+ players, 180,000+ matches. | "Pick 5" + very short loops works. But it drafts *tokens*, not traders, and it is real-money entry (a wager). |
| **LIQD** — liqd.cc | Trading competitions ranked by real PnL/ROI pulled from Hyperliquid; non-custodial; organisers share on X to launch. | Reading Hyperliquid data for rankings is proven. But you have to *trade* to play. |
| **Liquidate** — liquidate.trade | 30/60/120-min perps sprints on Hyperliquid; published composite score (net return, risk-adjusted return, profit factor, liquidation penalty); results settled to a Merkle root. | Publish the formula, make it deterministic, punish recklessness. Again: players must trade. |
| **Legend** — legend.trade | Social trading on Hyperliquid: copy-trade, 1v1 duels with wagers and ELO, clans, ranks, live events (NYC). | Duels/clans/ranks = status loops traders love. Still requires capital and trading skill. |
| **Hyperliquid vaults** — HL docs | Deposit into a leader's vault; leader gets 10% profit share and must keep ≥5% of it. | Real-money "back a trader". Our game is the free, no-custody version of "who would you back?". |
| **HyperDash** — docs.hyperdash.com | Leaderboard ranked by net *realized* PnL (24H/7D/30D…), copy-trade up to 10 wallets, 0.05% builder fee. | Good trader discovery already exists; traders are already a "spectator sport". Builder-fee copy trading is a proven monetisation path. |
| **Fantasy Top** (Blast) — Decrypt, DappRadar | Draft 5 crypto-influencer NFT cards, scored on X engagement, weekly tournaments. Says it paid >$20M to players; **shut down June 2026**. | Draft-5 weekly fantasy hooks CT hard. Card-buying/pay-to-play economics and scoring based on X engagement were fragile. |
| **Kaito Yaps** — CoinGecko | Leaderboards that rewarded posting on X. **Sunset 15 Jan 2026** after X revoked API access for apps that reward users for posting. | **Never reward posting.** Share cards must be optional bragging, with no points for sharing. |

## Our angle
**Draft real Hyperliquid traders, not tokens or influencers, for free.**
- *Skill = picking people*: reading wallets, styles and risk. Hyperliquid makes every trader's PnL public, which no CEX or sports league can match.
- *No capital, no trading, no custody*: anyone on X can play. CFL/LIQD/Liquidate/Legend all need you to stake or trade.
- *Verified pool*: we reuse our wallet checker, so no empty, vault or dust wallets, and the scores are on-chain truth anyone can recompute.
- *Salary cap* (DFS mechanic) so you can't just take the top 5.
- *Fast loop*: live score from the minute you lock in, weekly reset, a bragging card for X. Daily/1-hour "sprint" contests are an easy next mode, using the same engine with a shorter window.

## Risks we noted
- Real-money entry + prizes = gambling or skill-gaming regulation in most places (CFL, Legend wagers). We stay points-only; see README "How this makes money later".
- X policy: no rewards for posting (see Kaito).
- Traders may not want to be "drafted". Use only public wallets, show addresses, honour opt-out requests (to do: an opt-out list).

## Sources
- https://www.cfl.fun/ · https://www.liqd.cc/ · https://landing.dev.liquidate.trade/about · https://www.legend.trade/ · https://www.legend.trade/esports
- https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/vaults/for-vault-leaders
- https://docs.hyperdash.com/leaderboard · https://docs.hyperdash.com/copy-trade
- https://decrypt.co/368640/ethereum-crypto-influencer-game-fantasy-top-shutting-down · https://dappradar.com/blog/fantasytop-game-guide-how-to-play-and-earn
- https://www.coingecko.com/learn/what-is-kaito-earn-yap-points
- Hyperliquid info API (`portfolio`, `userFillsByTime`): https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
