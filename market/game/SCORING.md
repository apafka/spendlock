# Scoring (how a team's score is computed)

Code: `lib/hl.js` (`returnOf`) and `lib/league.js` (`scoreEntry`). Tests: `test/game.test.js`.

## Data
For each trader we read Hyperliquid's documented info endpoint `{"type":"portfolio","user":...}`.
It returns, per window (day / week / month / allTime), two series: `accountValueHistory` and `pnlHistory`.
`pnlHistory` is trading PnL: it already leaves out deposits and withdrawals, and it includes
realized + unrealized PnL after fees and funding. We work on the all-time scale (day and week series are shifted onto it).

A reading is `{t, pnl, av}` = time, cumulative PnL, account value.

## One trader, from reading A (baseline) to reading B (latest)
```
pnl      = B.pnl - A.pnl                    # trading PnL in the window
netFlow  = (B.av - A.av) - pnl              # what moved in or out that was NOT trading
capital  = max(A.av + max(0, netFlow), $10,000)
return   = clamp(pnl / capital, -100%, +200%)
```
- **Deposits** don't count as profit (they are not in `pnl`) and they raise `capital`, so "deposit $1M, make $10k" is +1%, not +1000%.
- **Withdrawals** never shrink `capital`, so "withdraw 90%, then make a small gain" doesn't look huge.
- **$10k floor**: a near-empty wallet can't post +5000% on a $50 win.
- **Clamp**: one freak trader can move a team at most +200% / −100%, so it stays a 5-pick game.

## A team
`score = average of the 5 traders' returns`, shown in % (e.g. +3.41%). Tie-break: higher team $PnL (sum of the 5).

## Baselines (when the clock starts)
- **Week-start baseline**: the scoring job reads every pool trader at Monday 00:00 UTC. If the job wasn't running then,
  it backfills from the portfolio history (the reading at or just before Monday 00:00; Hyperliquid's history points are
  roughly 1.5–2.5 h apart, so a backfill can start up to ~2.5 h early; in the first live run the readings were 00:06–02:18 before the start). The leaderboard says which mode was used.
- **Your entry**: a team entered during the week starts from a fresh live reading of its 5 traders at the moment you lock in.
  You can't draft Monday's winners on Wednesday and get Monday's gains.
- **Week end**: after Monday 00:00 UTC the job freezes the week using readings at the end time and marks it final.

## Why total PnL (marked to market) and not only realized PnL
Realized-only scores are easy to game and lag: a trader who never closes a losing position looks fine.
Total PnL counts open positions at mark price, which is what Hyperliquid's own portfolio and leaderboard show.
Realized PnL for the week (closedPnl − fees from `userFillsByTime`) is still fetched for drafted traders and
stored next to the score as context.

## Hard to game?
- Players don't control the traders, and the pool is chosen by us (leaderboard + the wallet checker: ≥10 trades and
  ≥$50k account value in 30 days).
- Score uses only public onchain data; anyone can recompute it from the API.
- Remaining risks (fine for points, must be fixed before prizes): a pool trader who is also a player could wash-trade
  between their own wallets to pump one; very active wallets (10k-fill API cap) only show their newest fills, which
  affects the realized-PnL context number, not the score; backfilled baselines are approximate.
