# Spendlock

A policy wallet for solo and small founder teams who run multi-tool AI agents and do not want runaway spend.

Ramp and model vendors cover spend inside their walls. Crypto rails cover the agent economy. Spendlock is the policy you can fund this week across tools that are not yet agent-native merchants.

**Connect agents. Set a daily cap. Allow only these domains. Pause everything. Download the log.**

v0 is a local web app. No API keys. No chain. No database service.

## Run on localhost

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the landing page.

Open [http://localhost:3000/app](http://localhost:3000/app) for the dashboard.

That is the whole install.

## What the demo shows

The dashboard loads with seeded data so it is not empty on first run:

- Three agents: Cursor Research, Deploy Bot, Invoice Scout
- A funded demo policy (remaining balance after sample spends)
- A hard daily cap of **$50**
- An allowlist that includes `api.openai.com`, `api.anthropic.com`, `cloud.lambdalabs.com`, and one settlement address
- A spend log with a mix of allowed and blocked rows (allowlist misses and a cap hit)

Change the cap, edit the allowlist, or hit **Pause everything**, then use **Try a spend**. The newest log row is the verdict. Refresh the page: pause, cap, allowlist, funds, and the log survive in `localStorage` (`spendlock.v0`).

**Reset demo** restores the seeded state.

**Export CSV** downloads the log (`time`, `agent`, `merchant`, `amount_usd`, `status`, `reason`).

## What is intentionally not built yet

- Real cards or bank rails
- Real USDC settlement or wallet connect
- Multi-user auth and team seats
- Live interception of Cursor, OpenAI, or cloud traffic
- A hosted production backend

v0 does not invent a new spend primitive. Caps, allowlists, pause, and an audit log are the product.
