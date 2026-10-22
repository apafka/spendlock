import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

const CONTACT = "pafka@hey.com";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader actionHref="/demo" actionLabel="Try the demo" />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-20 sm:px-8">
        <section className="grid gap-12 pb-16 pt-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:pb-20 lg:pt-14">
          <div>
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.16em] text-muted">
              Agent Profiles for every seller, not one store
            </p>
            <h1 className="max-w-4xl font-serif text-4xl leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Spend limits your agent can&apos;t turn off
            </h1>
          </div>
          <div className="max-w-md space-y-6">
            <p className="text-lg leading-8 text-ink">
              Limits live in the vault, outside the agent, so a misbehaving agent cannot raise
              its cap or skip approval. One budget across every seller — not one per platform.
            </p>
            <p className="text-lg leading-8 text-ink">
              Walmart, Stripe, Circle each enforce limits only inside their own rails. Spendlock
              is the cross-platform version: one budget, one rule set, one log for all of a
              team&apos;s agents, wherever they pay. Starting with x402 sellers.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/demo"
                className="rounded-full bg-pine px-5 py-3 text-sm font-medium text-card hover:bg-pine-deep"
              >
                Try Agent Profiles
              </Link>
              <a
                href="#pricing"
                className="rounded-full border border-rule px-5 py-3 text-sm font-medium text-ink hover:bg-paper-2"
              >
                Pricing
              </a>
            </div>
            <p className="text-sm text-muted">
              No wallet. No keys. Simulated play money in the browser. Testnet only — never mainnet.
              Non-custodial: funds stay in your vault.
            </p>
          </div>
        </section>

        <section className="grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-5">
          {[
            {
              title: "Agent Profiles",
              body: "Each agent gets a name, a budget, an approval rule, its own purchase history, and an off switch.",
            },
            {
              title: "Hard caps",
              body: "Per-tx, daily, and lifetime live in the vault. The agent cannot raise them.",
            },
            {
              title: "Ask the owner",
              body: "Approve every purchase, or auto-approve under $50, $100, or $200. Above that waits.",
            },
            {
              title: "One log",
              body: "Paid, blocked, waiting — every seller, every agent, in plain English.",
            },
            {
              title: "Kill switch",
              body: "One switch freezes every agent. Owner can still pull funds out.",
            },
          ].map((item) => (
            <article key={item.title} className="bg-card p-6">
              <h2 className="font-serif text-2xl text-ink">{item.title}</h2>
              <p className="mt-3 text-[15px] leading-7 text-muted">{item.body}</p>
            </article>
          ))}
        </section>

        <section id="why-now" className="mt-20 grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-muted">Why now</p>
            <h2 className="mt-2 font-serif text-3xl text-ink sm:text-4xl">
              Stores are adding agent profiles. Your agents shop everywhere else too.
            </h2>
          </div>
          <div className="space-y-5 text-[16px] leading-7 text-ink">
            <p>
              Walmart just announced Agent Profiles: each agent gets its own profile with a
              spending limit, approval by default, a separate purchase history, and an off switch
              — inside Walmart. That is the right model. It is still one store.
            </p>
            <p>
              If your Cursor agents already buy data, compute, or other agents&apos; work over
              x402, a prompt is not a spending policy. Off-chain limits in the agent&apos;s own
              code can be skipped. Spendlock puts the rules in a vault the agent does not
              control: USDC on Base, testnet for now, no token, no mainnet, no custody of
              customer money.
            </p>
            <p className="text-muted">
              Start with x402 sellers (HTTP 402, pay in USDC, retry with proof). One budget
              follows the agent across every seller that speaks 402.
            </p>
          </div>
        </section>

        <section className="mt-20">
          <h2 className="font-serif text-3xl text-ink">The whole product</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            <li className="rounded-2xl border border-rule bg-card p-6">
              <p className="text-sm font-medium text-muted">1. Fund a vault</p>
              <p className="mt-3 text-[16px] leading-7">
                You deposit USDC. Each agent gets a profile: caps, approval rule, seller
                allowlist, pause/delete. Spendlock never holds the money.
              </p>
            </li>
            <li className="rounded-2xl border border-rule bg-card p-6">
              <p className="text-sm font-medium text-muted">2. Agents pay inside the rails</p>
              <p className="mt-3 text-[16px] leading-7">
                <code className="text-sm">spendlock_pay</code> hits an x402 seller. On 402, the
                profile is checked <em>before</em> paying. Over cap, blocked seller, or kill
                switch → rejected and logged. Above the approval rule → waits.
              </p>
            </li>
            <li className="rounded-2xl border border-rule bg-card p-6">
              <p className="text-sm font-medium text-muted">3. You watch one dashboard</p>
              <p className="mt-3 text-[16px] leading-7">
                One card per agent. Approve the big ones. Pause or delete a profile. Or hit the
                kill switch. Export the team log.
              </p>
            </li>
          </ol>
        </section>

        <section id="pricing" className="mt-20">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-muted">Pricing</p>
          <h2 className="mt-2 font-serif text-3xl text-ink sm:text-4xl">
            Free to try. A monthly team plan when you have more than one agent.
          </h2>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            <article className="rounded-2xl border border-rule bg-card p-8">
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-muted">
                Free
              </p>
              <p className="mt-3 font-serif text-4xl text-ink">EUR 0</p>
              <p className="mt-2 text-sm text-muted">One agent, a small cap, the demo rails.</p>
              <ul className="mt-6 space-y-2 text-[16px] leading-7">
                <li>1 agent profile</li>
                <li>Per-tx / daily / lifetime caps</li>
                <li>Readable log, pause switch</li>
                <li>Simulated or local anvil only</li>
              </ul>
            </article>
            <article className="rounded-2xl border border-rule bg-card p-8">
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-muted">
                Team plan
              </p>
              <p className="mt-3 font-serif text-4xl text-ink">EUR 29–99 / month</p>
              <p className="mt-2 text-sm text-muted">Placeholder. We&apos;ll lock a number with the first teams.</p>
              <ul className="mt-6 space-y-2 text-[16px] leading-7">
                <li>One vault, every agent, every seller.</li>
                <li>Approval rules, allowlist, kill switch.</li>
                <li>MCP tools so Cursor cloud agents can call pay.</li>
                <li>Bootstrapped. No token. No protocol fee.</li>
              </ul>
            </article>
            <article className="rounded-2xl border border-rule bg-pine p-8 text-card">
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-card/70">
                Done-for-you setup
              </p>
              <p className="mt-3 font-serif text-4xl">EUR 500</p>
              <p className="mt-2 text-sm text-card/75">
                Optional. For founders whose agents already spend and who want the rails
                installed, not explained.
              </p>
              <p className="mt-6 text-[16px] leading-7 text-card/90">
                We stand up the vault on Base Sepolia (or local), set per-agent profiles, wire
                the MCP tools into Cursor, and walk the owner dashboard with you.
              </p>
              <a
                href={`mailto:${CONTACT}?subject=Spendlock%20setup%20install`}
                className="mt-8 inline-flex rounded-full bg-card px-5 py-3 text-sm font-medium text-pine-deep hover:bg-paper"
              >
                Email {CONTACT}
              </a>
              <p className="mt-3 text-xs text-card/60">
                Testnet setup only. Do not send real funds.
              </p>
            </article>
          </div>
        </section>

        <section className="mt-20 rounded-2xl border border-rule bg-card px-6 py-10 sm:px-10">
          <h2 className="font-serif text-3xl text-ink">Not this</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 text-[16px] leading-7 text-muted">
            <p>
              Not a bank. Not a token. Not custody of customer money. Not a waitlist that hides
              the product. Cards and mainnet come later, if ever, and never from this repo as it
              stands.
            </p>
            <p>
              Settlement rail is USDC on Base. Today that means testnet, local anvil, and a
              simulated browser demo. The contract is unaudited. Never put real money in it.
            </p>
          </div>
          <Link
            href="/demo"
            className="mt-8 inline-flex rounded-full bg-pine px-5 py-3 text-sm font-medium text-card hover:bg-pine-deep"
          >
            Open the Agent Profiles demo
          </Link>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-5 py-8 text-sm text-muted sm:px-8">
        Spendlock · USDC on Base (testnet) · No token · No mainnet · Unaudited · {CONTACT}
      </footer>
    </div>
  );
}
