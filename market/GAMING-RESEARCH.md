# Gaming product options built on the pay-per-verified-result USDC escrow

Prepared for Alan Pafka, 19 Oct 2026 (Europe/Tallinn). Research only; nothing was built.
Every figure below comes from a linked source. Anything I could not confirm from a first-party or reliable source is tagged **[UNVERIFIED]**. Judgment calls are tagged **[ASSESSMENT]**. This is not legal advice: the legal sections show what the sources say and where the risks are.

Existing primitive: the buyer locks USDC → the worker delivers → a checker verifies each item → payment settles per verified item → the rest is refunded.

---

## 1. Escrowed CS2 skin and item trades with machine-verified delivery

### Market size
- Total CS2 item market cap (a stock figure, not trading volume): about $4.1B in Feb 2025 ([Frontiers in AI, 2025](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2025.1702924/full)). It passed $6B on 17 Oct 2025 per Pricempire ([Dexerto](https://www.dexerto.com/counter-strike-2/counter-strike-2-skins-market-value-hits-all-time-record-in-the-billions-3158189/)), then dropped to $4.12B after Valve's trade-up update that lets players trade up into knives and gloves ([Türkiye Today](https://www.turkiyetoday.com/business/cs2-skin-market-tops-6b-amid-record-gains-ahead-of-valves-knife-trade-update-3208863)).
- Today: csmarketcap.com shows **$5.42B**, with an all-time high of $8.71B. That is −33% over 1 year and −19% over 90 days ([csmarketcap](https://csmarketcap.com/market-cap)). Different trackers use different methods, so their numbers do not agree exactly.
- Dexerto (citing other reporting) says case openings earned Valve "nearly $1 billion" in 2023 and that over 400M cases are opened per year. **[UNVERIFIED: secondary source, and Valve does not publish these numbers.]**
- I found **no reliable public figure for annual third-party marketplace trading volume (GMV)**. Any GMV number you see should be treated as unverified.

### Existing players: fees and trust models
Seller fees as published, collected by [csrated.com (checked 24 Sep 2026)](https://csrated.com/marketplaces/fees/) and [Veriloot (checked Oct 2026)](https://veriloot.gg/en/tools/fees). Third-party aggregators disagree in places (for example noban.gg and skin.gg list Skinport at 12% and BitSkins at 10%), so check each site's own page before relying on a number.

| Market | Seller fee | Notes |
|---|---|---|
| Buff163 | 1.5% (Buff Market 2.5%) | China-based, largest by volume per skin.gg **[UNVERIFIED]** |
| CSFloat | 2%; withdrawal 2.5% down to 0.5% by volume | P2P: the seller sends the Steam trade directly |
| DMarket | 2–10% by liquidity ([DMarket help, Mar 2026](https://support.dmarket.com/hc/en-us/articles/25141430592401-DMarket-Fees)) | Multi-game |
| CS.Money | 5%, falling to 3% above $1k | Bot/instant trades |
| BitSkins | 5% (csrated/skin.gg) vs 10% (noban) **[CONFLICTING]** | Crypto-first relaunch |
| Waxpeer | 6% | P2P, crypto payouts |
| Skinport | 8%, falling to 6% from €1k | EU-based; bank payout |
| Steam Market | 15% (5% Steam + 10% CS2) | Wallet credit only, cannot be cashed out; per-item sale cap of $2,000 per a [Steam community guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3527966318) **[UNVERIFIED by Valve]** |

Trust and escrow models after Trade Protection:
- **CSFloat** holds seller proceeds until the 7-day protection window ends (about 8 days), and permanently bans anyone who reverses a sale. Source: CSFloat's announcement as reposted on [r/csgomarketforum](https://www.reddit.com/r/csgomarketforum/comments/1m205k2/official_announcement_by_csfloat_regarding_trade/). **[Secondary: CSFloat's own FAQ is JS-rendered and I could not read it directly.]**
- **Skinport** takes items into its own bots. A deposited item can't be sold during the 7-day lock and is listed afterwards ([Skinport FAQ](https://skinport.com/faq/trade-protection-skin-trading), seen via search snippet; the page did not render).
- So the market leaders already run an "escrow until finality" model. **Holding funds isn't new. What Alan would add is per-item partial settlement, USDC rails, and a public verification receipt.** [ASSESSMENT]

### Steam rules (verified)
- **Trade holds:** without Steam Guard Mobile Authenticator, trades are held up to 15 days. Trades made in the first 7 days after enabling it can still be held ([Steam Support: Trade and Market Holds](https://help.steampowered.com/en/faqs/view/34A1-EA3F-83ED-54AB); [Valve 2015 announcement](https://store.steampowered.com/news/20631/)). In the API, a held offer has `trade_offer_state = 11 (InEscrow)`.
- **Trade Protection (16 Jul 2025, CS2):** traded items arrive immediately but are "Trade Protected" for 7 days. During that time they can't be traded, consumed, or modified. Either party can reverse **all** of their protected trades with one click and no support ticket. Everything goes back to the previous owners, and the account that reversed is locked from trading and the Market for 30 days. Protected and unprotected items can't be mixed in one trade. ([Steam Support FAQ 365F-4BEE-2AE2-7BDD](https://help.steampowered.com/en/faqs/view/365F-4BEE-2AE2-7BDD); [PC Gamer](https://www.pcgamer.com/games/fps/steam-will-let-you-reverse-your-last-7-days-of-cs2-and-soon-other-trades-if-you-accidentally-swap-your-usd10-000-ak-47-for-some-magic-beans/); [Hotspawn](https://www.hotspawn.com/counter-strike/news/cs2-trade-protection-update-death-of-cash-trading)).
- **What this means for escrow:** a seller can take USDC and then reverse the trade. **No cash-for-skins escrow can settle before day 7 + margin.** [ASSESSMENT]

### Can a machine verify delivery?
- **Trade offer state:** `IEconService/GetTradeOffer` returns `trade_offer_state` (3 = Accepted, 11 = InEscrow, and so on) ([Steamworks docs](https://partner.steamgames.com/doc/webapi/IEconService); [csfloat/extension constants](https://github.com/csfloat/extension/blob/e7864d09/src/lib/types/steam_constants.ts)). The catch: it only works with the API key of an account that is party to the trade. The [Steam Web API Terms](https://steamcommunity.com/dev/apiterms) say a key is "personal" and must not be shared with third parties. So a neutral checker should not collect users' keys, and asking for keys is also a well-known scam pattern. [ASSESSMENT]
- **Public inventory** (`steamcommunity.com/inventory/{steamid64}/730/2`): this endpoint is unofficial and heavily rate-limited (about 60 requests/min per IP is a community estimate **[UNVERIFIED]**), and the inventory must be public. **Trade-protected items do not appear in the public context-2 inventory until the 7 days pass**, according to a [Steam community thread](https://steamcommunity.com/app/730/discussions/0/594029764725056711/) and a [third-party API vendor's docs](https://woksteamapi.com/api/cs2-trade-protection.md), which also claim a separate 10-day public-visibility delay **[UNVERIFIED by Valve]**. Valve's fully documented `IInventoryService/GetInventory` needs a publisher key, so it is not available to Alan (same vendor source).
- **What a workable checker looks like [ASSESSMENT]:**
  1. Record the trade offer ID and asset details (market_hash_name, plus float/paint seed from the inspect link) at lock time.
  2. **Phase A (day 0):** the buyer confirms receipt in the UI, or the seller's own browser extension reports state 3 (the CSFloat model).
  3. **Phase B (day 8–11):** poll the buyer's public inventory for the matching item. It only becomes visible about when the trade becomes irreversible, which conveniently lines up verification with finality.
  4. Settle per item that is found. Refund the buyer for any item missing at the deadline.
  Asset IDs change on every trade, so matching uses item name plus float/seed, not the asset ID. Steam can also return partial inventories, so the "missing → refund" rule needs a dispute buffer.

### Valve ToS risk
- [Steam Online Conduct](https://store.steampowered.com/online_conduct) lists "selling content, gift cards, or other items" and "gambling" under prohibited "commercial activity". In practice Valve tolerates third-party marketplaces (CSFloat, Skinport, and others operate openly), but it can ban accounts at will. [ASSESSMENT]
- Precedent: in May 2023, after the conduct update, high-value inventories linked to crypto cash-out sites were community-banned. Traders blamed stolen skins flowing through crypto withdrawals ([Dot Esports](https://dotesports.com/counter-strike/news/valves-latest-assault-on-csgo-skin-traders-shows-devs-commitment-to-fighting-gambling); [Dexerto](https://www.dexerto.com/csgo/steam-bans-high-value-csgo-traders-for-dealing-with-gambling-sites-its-just-getting-started-2149006/)). **A USDC payout rail is exactly the profile Valve has gone after.** Mitigations: P2P only (no house bots holding inventory), the 8-day hold, wallet screening, and refusing items with recent reversals.

### Is USDC a real edge?
- **For it:** USDC is MiCA-compliant in the EU (Circle got a French EMI licence on 1 Jul 2024 ([Circle](https://www.circle.com/pressroom/circle-is-first-global-stablecoin-issuer-to-comply-with-mica-eus-landmark-crypto-law); [CNBC](https://www.cnbc.com/2024/07/01/eu-mica-law-crypto-firm-circle-gets-french-license-for-stablecoin.html))), while Binance delisted non-MiCA stablecoin pairs such as USDT for EEA users on 31 Mar 2025 ([Binance](https://www.binance.com/en/support/announcement/detail/bcaa1f68d6a6450099056ff694ad6c46)). Payouts are global and instant, with no chargebacks, and USDC works for cross-border OTC trades where PayPal or bank transfers are risky.
- **Against it:** big markets already offer crypto payouts (Waxpeer, BitSkins, DMarket per skin.gg), so crypto alone isn't a moat. CSFloat's 2% fee is hard to undercut.
- **Real edge [ASSESSMENT]:** **trades too large or too custom for a listing site.** Think high-value OTC trades closed on X/Discord (multi-item bundles, sticker crafts, "middleman" deals), where today people use human middlemen and get scammed. Per-item partial settlement plus an on-chain receipt is new there.
- **Regulatory flag:** holding USDC for others may count as crypto-asset custody or transfer under MiCA (a CASP licence). A non-custodial smart-contract escrow may avoid that. **[UNVERIFIED: needs an Estonian/EU crypto lawyer before handling real money.]**

---

## 2. Fantasy CS2 esports league
- **HLTV Fantasy** is free to play and funded by sponsors. The Fall 2026 season pays $10,000 to the top 10 ($5k / $2k / $1k / $300×7), and prizes plus per-game skin prizes are sponsored by **Hellcase**, a case-opening site ([HLTV, 11 Aug 2026](https://www.hltv.org/news/45277/10000-fantasy-season-continues-with-32-team-ewc-group-stage)). HLTV owns the audience.
- **Paid "pick'em" in the US:** PrizePicks and Underdog offer paid CS2 player-stat picks in eligible US states ([PrizePicks payouts](https://www.prizepicks.com/help-center/payouts); [where can I play](https://www.prizepicks.com/help-center/where-can-i-play); [gameofskill.gg](https://www.gameofskill.gg/cs2-dfs-picks)).
- **Ways to make money:** (a) free to play with sponsors (the HLTV model, which needs an audience first); (b) paid entry with a prize pool. In Estonia a paid entry with money prizes based on results Alan doesn't control likely falls under "toto" or "game of skill" licensing (see §3) **[ASSESSMENT, unverified for fantasy specifically]**; (c) premium stats or tools subscriptions; (d) private leagues for creators' communities, where the escrow holds a creator-funded prize pool and pays per verified result. Option (d) is the escrow fit, and it's legal only if players pay nothing. [ASSESSMENT]
- **Weakness:** HLTV already gives away $10k per season for free. A new entrant has no edge except creator-community leagues.

---

## 3. Skill-based 1v1 stake duels
- **EU:** "There is no sector-specific EU legislation in the field of gambling services". Each member state decides for itself ([European Commission](https://single-market-economy.ec.europa.eu/sectors/gambling_en)). There's no EU-wide passport, so the rules differ by country.
- **Estonia ([EMTA](https://www.emta.ee/en/business-client/registration-business/gambling-operators)):** "games of skill" are a regulated **type of gambling**: games "the outcome of which depends predominantly on the physical skills or abilities or knowledge of the player... played by means of a mechanical or electronic device". Online, they need an **activity licence plus an operating permit** from the Tax and Customs Board (EMTA). The only exemption is when the sole prize is the chance to play again. **An esports money-match platform run from Estonia needs a gambling licence.** A search summary claimed a €50 prize cap for remote skill games **[UNVERIFIED: I couldn't load the Gambling Act text on riigiteataja.ee]**.
- **Publisher rules:** Epic's [Community Rules](https://legal.epicgames.com/epicgames/community-rules) list gambling as prohibited, and Epic is reported to ban Fortnite cash wager matches ([Engadget on Game+](https://www.engadget.com/money-betting-esports-app-gameplus-fortnite-epic-140042003.html)) **[the exact FNCS clause wasn't readable directly]**. Valve's conduct rules list gambling and "running contests".
- **Existing players:** FACEIT runs CS2 tournaments and 1v1 aim formats but not cash wagers ([FACEIT](https://www.faceit.com/en/cs2/tournaments)). **Challengermode** offers pay-to-enter tournaments with wallet deposits and withdrawals ([Challengermode support](https://support.challengermode.com/en/start-here/what-can-i-do-with-money-on-challengermode)). Checkmate Gaming and GamerSaloon advertise cash matches. **1v1Me shut down wagering on 1 Nov 2024** because "only the top few percent of players could consistently win money. Most players... would try wagering, lose, and not return" ([1v1Me blog](https://www.1v1me.com/blog/wager-shutdown)). That's a strong warning about retention.
- Technical difficulty: verifying a match result needs a game API or demo parsing plus anti-cheat. FACEIT has its own anti-cheat; a solo builder doesn't.

---

## 4. Skin-gambling sites (CSGOEmpire model)
- **CSGOEmpire licensing (checked, not assumed):** the Curaçao Gaming Authority certificate ([cert.cga.cw/token?id=869](https://cert.cga.cw/token?id=869), fetched today) shows **Moonrail Limited B.V., licence OGL/2024/1183/0869, "Application status: Granted. License status: Active", licensed since 31 Mar 2025**, covering csgoempire.com and 19 other domains. **The sources conflict:** iGregulator lists the same licence as "provisional — CGA final assessment in progress", issued 30 Sep 2025, expiry 31 Mar 2026, past expiry ([iGregulator](https://app.igregulator.io/licenses/b626cc56-ad78-42af-9cbc-feeccbe43be0)), and SkinsVault says "under assessment" ([SkinsVault](https://skinsvault.gg/platforms/csgoempire)). Bottom line: it's a Curaçao B2C licence whose final status is disputed, and Curaçao is a low-bar regime. CSGOEmpire's [help centre](https://help.csgoempire.com/en/articles/5332368-is-the-site-legal) says it geoblocks restricted countries.
  - ⚠️ A search result pointed to **csgoemplre.com** (an "L" in place of the "i"), which looks like a typosquat or phishing domain citing an old "8048/JAZ" licence. Don't use it.
- **Valve enforcement history:** in July 2016, Valve's general counsel sent cease-and-desist letters to 23 sites (CSGO Lotto, CSGOLounge, CSGO500, CSGODouble, and others) saying commercial use of Steam accounts breaches the SSA, with 10 days to stop ([Polygon](https://www.polygon.com/2016/7/20/12240606/valve-cease-and-desist-letter-csgo-betting-sites/); [Ars Technica](https://arstechnica.com/gaming/2016/07/valve-lawyers-send-cease-and-desist-letters-to-counter-strike-gambling-sites/); [Critical Hit, full list](https://www.criticalhit.net/gaming/valve-issues-csgo-gambling-sites-cease-desist-letters/)). In **May 2023** Valve added gambling to the conduct rules, and bans of traders linked to Empire followed. Empire disputed that its users were targeted (Dot Esports, Dexerto above). I found no specific 2025–2026 Valve action against gambling sites in this pass **[UNVERIFIED either way]**.
- **Distribution is blocked:** Twitch bans promoting or sponsoring skin gambling (Aug 2023) and unlicensed slots/roulette/dice sites ([Twitch Safety](https://safety.twitch.tv/s/article/Prohibiting-Unsafe-Slots-Roulette-and-Dice-Gambling-Sites?language=en_US); [GamesIndustry.biz](https://www.gamesindustry.biz/twitch-bans-streamers-from-promoting-skin-gambling-sites)). Kick allows gambling streams only from sites with ID-verified 18+ users from 1 Feb 2025 ([FIRST.com](https://first.com/news/casino/kick-gambling-policy-update)). Kick is owned by Easygo, co-founded by Stake's Ed Craven ([Wikipedia](https://en.wikipedia.org/wiki/Kick_(service))).
- **Why it's risky for Alan [ASSESSMENT]:** (1) Operating from Estonia without an EMTA licence is illegal, and an EMTA licence requires a trustworthy legal entity, reporting systems, and the restricted-players list. (2) A Curaçao licence doesn't make it legal in EU states that require local licences. (3) Valve can wipe the bot inventories overnight (2016 precedent). (4) Twitch bans it. (5) Minors are a known issue, as with the 2016 lawsuit over underage gambling (Polygon). (6) Payment processors and banks shut down gambling-adjacent startups. (7) It conflicts with an escrow brand built on trust.

---

## 5. Player-owned persistent-world economy
- **Axie Infinity:** its play-to-earn economy depended on new players putting cash in. When growth slowed, token values and revenue collapsed ([Naavik deep dive](https://naavik.co/deep-dives/axie-infinity-part-2/); [Business Times](https://www.businesstimes.com.sg/companies-markets/rise-and-fall-of-vietnams-largest-nft-based-online-video-game)).
- **EVE Online:** PLEX/ISK works because the game is fun first and the economy is anchored in paid game time, built over many years by a full studio ([Ars Technica 2022](https://arstechnica.com/gaming/2022/04/eve-onlines-success-shows-why-gaming-doesnt-need-nfts/)).
- **Star Atlas:** a multi-year roadmap that replaces token subsidies with gameplay loops (mining, crafting, combat). It's still in staged development years after launch ([SAGE economics](https://experience.staratlas.com/newsroom/game-manuals/sage-game-manual-part-1-economics); [2022 Q2 economic report](https://experience.staratlas.com/newsroom/economic-reports/star-atlas-economic-report-2022-q2)).
- **WoW** shows the opposite approach: Blizzard runs the economy itself (WoW Token) and does not allow real-money player trading. **[UNVERIFIED in this pass; from general knowledge]**
- **Why it's slow [ASSESSMENT]:** you need a fun game before the economy matters, which means content, art, servers, and anti-bot work. You need enough players before a market has liquidity. A token economy without sinks collapses. Plus the securities and gambling questions. It doesn't fit one founder working in Cursor on a weekly timeline.

---

## Scorecard (1–5, **higher = better on every axis**; "Legal" 5 = lowest risk)

| Option | Excitement | Solo in Cursor | Legal (5 = safe) | Path to first $1k | Escrow fit | X/Twitch/Kick | **Total** |
|---|---|---|---|---|---|---|---|
| 1. CS2 verified-delivery escrow (OTC/middleman) | 4 | 4 | 3 | 4 | **5** | 3 | **23** |
| 2. Fantasy CS2 (creator leagues, free to play) | 3 | 4 | 4 | 2 | 2 | 4 | 19 |
| 3. 1v1 stake duels | 5 | 2 | 1 | 3 | 4 | 4 | 19 |
| 4. Skin-gambling site | 4 | 3 | 1 | 3 | 2 | 2 | 15 |
| 5. Player-owned persistent world | 5 | 1 | 3 | 1 | 2 | 3 | 15 |

The scores are my judgment from the sources above. Excitement is inferred from Alan's stated interests (CS, CSGOEmpire, Stake). Distribution for option 1 is a 3 because Twitch and Kick suit spectacle; skin traders mostly live on X, Discord, and YouTube.

---

## Pick: **Option 1, "SkinLock": USDC escrow for CS2 OTC trades with per-item verified delivery**
Why: it reuses the existing escrow almost unchanged (per-item check → per-item settle → refund the rest). It targets a real pain point, human middleman scams in X/Discord trades. It avoids gambling licensing entirely, and settlement lines up with Steam's 7-day finality instead of fighting it.

### 1-week MVP scope (solo, Cursor)
**Day 1: deal model.** A deal has a buyer and a seller (SteamID64 via Steam OpenID login, which returns only the SteamID, no API key), a USDC wallet for each, and N line items (market_hash_name, inspect link → float/seed, USDC price). The buyer locks the sum of the prices (existing code).
**Day 2: inspect and pricing.** Parse inspect links to get float/seed (reuse an open-source inspect service or have the seller paste the CSFloat inspect output). Show reference prices from the public Steam Market `priceoverview` endpoint labelled "reference only".
**Day 3: delivery capture.** The seller pastes the Steam trade offer ID, and the buyer clicks "received" for each item (Phase A, soft). Status moves to `delivered_pending_finality`, with a countdown to T+8 days.
**Day 4: checker (Phase B).** A cron job polls the buyer's public inventory `/inventory/{id}/730/2` with backoff, matching each line item by name plus float/seed. Found = verified. Not found by T+11 days = refund that item. A manual "dispute" flag freezes the deal.
**Day 5: settlement and receipts.** Release USDC to the seller for each verified item and refund the rest (existing code). Publish a public receipt page per deal (items, timestamps, tx hashes) that people can share on X.
**Day 6: safety.** Require a public inventory and Mobile Authenticator (check that the trade offer is not state 11). Cap MVP deals at a small amount. Set a 2% fee, matching CSFloat. Screen wallets with a free sanctions list. ToS: no stolen items, a reversal means forfeit and a ban, 18+.
**Day 7: launch.** Landing page plus 3 real test deals with friends. A thread on X pitched as "middleman scams are over: escrow that only pays per item Steam shows arrived". DM 20 CS2 trading accounts and Discord OTC servers.

**Out of scope:** bots holding inventory, fiat, a listing marketplace, other games, auto-pricing.
**Before real money:** get a lawyer's read on whether escrow as built is custodial (MiCA CASP) or non-custodial. **[UNVERIFIED risk]**
**First $1k math [ASSESSMENT]:** at a 2% fee, $1k needs $50k in settled volume, which is a few high-value OTC deals a week. Whether that demand exists is unverified, so test it with the Day 7 outreach.
