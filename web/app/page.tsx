import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

const CONTACT = "TODO@example.com";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader actionHref="/demo" actionLabel="Try the demo" />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-20 sm:px-8">
        <section className="grid gap-12 pb-16 pt-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:pb-20 lg:pt-14">
          <div>
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.16em] text-muted">
              For small founder agent teams
            </p>
            <h1 className="max-w-4xl font-serif text-4xl leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Basecamp-simple spend rails for your small agent team: one dashboard, hard caps,
              allowlist, kill switch, readable log.
            </h1>
          </div>
          <div className="max-w-md space-y-6">
            <p className="text-lg leading-8 text-ink">
              Broad agent-payment platforms want to be the bank, the identity layer, and the
              marketplace. Spendlock is the opposite: a vault of USDC on Base, with rules the
              contract actually enforces.
            </p>
            <p className="text-lg leading-8 text-ink">
              Per-agent caps. Daily limit. Recipient allowlist. Owner approval above a threshold.
              One kill switch. A log you can read.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/demo"
                className="rounded-full bg-pine px-5 py-3 text-sm font-medium text-card hover:bg-pine-deep"
              >
                Try the interactive demo
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
            </p>
          </div>
        </section>

        <section className="grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-5">
          {[
            {
              title: "Hard caps",
              body: "Per-agent per-tx, daily, and lifetime budget. Over the line, the money does not move.",
            },
            {
              title: "Allowlist",
              body: "Agents may pay only the addresses you listed. A stranger is a no, with a reason.",
            },
            {
              title: "Ask the owner",
              body: "Spends above a threshold wait. You approve or reject. The contract re-checks the rules.",
            },
            {
              title: "Kill switch",
              body: "One switch freezes every agent. Owner can still pull funds out.",
            },
            {
              title: "Readable log",
              body: "Spent, rejected, waiting — in plain English. Not a block explorer dump.",
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
              Agents are already spending. The rails are still hope.
            </h2>
          </div>
          <div className="space-y-5 text-[16px] leading-7 text-ink">
            <p>
              Recent reports suggest an AI research agent spent someone else&apos;s test funds
              without permission. Other reports suggest banks are starting to restrict how agents
              can reach customer accounts.
            </p>
            <p>
              If your Cursor agents already buy data, compute, or other agents&apos; work, a prompt
              is not a spending policy. Off-chain limits in the agent&apos;s own code can be
              skipped. Spendlock puts the rules onchain, on Base, in USDC — testnet for now, no
              token, no mainnet.
            </p>
            <p className="text-muted">
              We are not claiming those incidents as confirmed legal findings. They are the weather.
              Founders who let agents spend need hard rails they can install this week.
            </p>
          </div>
        </section>

        <section className="mt-20">
          <h2 className="font-serif text-3xl text-ink">The whole product</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            <li className="rounded-2xl border border-rule bg-card p-6">
              <p className="text-sm font-medium text-muted">1. Fund a vault</p>
              <p className="mt-3 text-[16px] leading-7">
                You deposit USDC. Each agent gets a policy: caps, allowlist, expiry, and when to
                ask you.
              </p>
            </li>
            <li className="rounded-2xl border border-rule bg-card p-6">
              <p className="text-sm font-medium text-muted">2. Agents spend inside the rails</p>
              <p className="mt-3 text-[16px] leading-7">
                Via MCP tools from Cursor, or a direct contract call. Over cap, off-list, or kill
                switch on → rejected and logged. Above threshold → waits.
              </p>
            </li>
            <li className="rounded-2xl border border-rule bg-card p-6">
              <p className="text-sm font-medium text-muted">3. You watch one dashboard</p>
              <p className="mt-3 text-[16px] leading-7">
                Approve the big ones. Pause one agent. Or hit the kill switch. Export the log.
              </p>
            </li>
          </ol>
        </section>

        <section id="pricing" className="mt-20">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-muted">Pricing</p>
          <h2 className="mt-2 font-serif text-3xl text-ink sm:text-4xl">
            A monthly team plan. A setup install if you want it done for you.
          </h2>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <article className="rounded-2xl border border-rule bg-card p-8">
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-muted">
                Team plan
              </p>
              <p className="mt-3 font-serif text-4xl text-ink">EUR 29–99 / month</p>
              <p className="mt-2 text-sm text-muted">Placeholder. We&apos;ll lock a number with the first teams.</p>
              <ul className="mt-6 space-y-2 text-[16px] leading-7">
                <li>One vault, one dashboard, your agents.</li>
                <li>Hard caps, allowlist, approval threshold, kill switch.</li>
                <li>MCP tools so Cursor cloud agents can call the vault.</li>
                <li>Bootstrapped. No token. No protocol fee.</li>
              </ul>
            </article>
            <article className="rounded-2xl border border-rule bg-pine p-8 text-card">
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-card/70">
                Done-for-you setup
              </p>
              <p className="mt-3 font-serif text-4xl">from EUR 500</p>
              <p className="mt-2 text-sm text-card/75">
                For founders whose agents already spend money and who want the rails installed,
                not explained.
              </p>
              <p className="mt-6 text-[16px] leading-7 text-card/90">
                We stand up the vault on Base Sepolia (or local), set per-agent policies, wire the
                MCP tools into Cursor, and walk the owner dashboard with you.
              </p>
              <a
                href={`mailto:${CONTACT}?subject=Spendlock%20setup%20install`}
                className="mt-8 inline-flex rounded-full bg-card px-5 py-3 text-sm font-medium text-pine-deep hover:bg-paper"
              >
                Email {CONTACT}
              </a>
              <p className="mt-3 text-xs text-card/60">
                Placeholder address — replace before publishing. Do not send real funds.
              </p>
            </article>
          </div>
        </section>

        <section className="mt-20 rounded-2xl border border-rule bg-card px-6 py-10 sm:px-10">
          <h2 className="font-serif text-3xl text-ink">Not this</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 text-[16px] leading-7 text-muted">
            <p>
              Not an AIsa-style agent-payment platform. Not a bank. Not a token. Not a waitlist
              that hides the product. Cards and mainnet come later, if ever, and never from this
              repo as it stands.
            </p>
            <p>
              Settlement rail is USDC on Base. Today that means testnet and a simulated browser
              demo. The contract is unaudited. Never put real money in it.
            </p>
          </div>
          <Link
            href="/demo"
            className="mt-8 inline-flex rounded-full bg-pine px-5 py-3 text-sm font-medium text-card hover:bg-pine-deep"
          >
            Open the demo
          </Link>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-5 py-8 text-sm text-muted sm:px-8">
        Spendlock · USDC on Base (testnet) · No token · No mainnet · Unaudited
      </footer>
    </div>
  );
}
