import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader actionHref="/app" actionLabel="Open the local demo" />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-20 sm:px-8">
        <section className="grid gap-12 pb-16 pt-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:pb-20 lg:pt-14">
          <div>
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.16em] text-muted">
              For solo and small founder teams
            </p>
            <h1 className="max-w-3xl font-serif text-5xl leading-[1.05] tracking-tight text-ink sm:text-6xl lg:text-7xl">
              A policy wallet for agents that spend outside the walls.
            </h1>
          </div>
          <div className="max-w-md space-y-6">
            <p className="text-lg leading-8 text-ink">
              Ramp and model vendors cover spend inside their walls. Crypto
              rails cover the agent economy. Spendlock is the policy wallet a
              bootstrap founder can fund this week — across tools that are not
              yet agent-native merchants.
            </p>
            <p className="text-lg leading-8 text-ink">
              Connect agents. Set a daily cap. Allow only these domains. Pause
              everything. Download the log.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/app"
                className="rounded-full bg-pine px-5 py-3 text-sm font-medium text-card hover:bg-pine-deep"
              >
                Open the local demo
              </Link>
              <a
                href="#not-this"
                className="rounded-full border border-rule px-5 py-3 text-sm font-medium text-ink hover:bg-paper-2"
              >
                What this is not
              </a>
            </div>
          </div>
        </section>

        <section className="border-y border-rule py-10">
          <p className="max-w-3xl font-serif text-2xl leading-snug text-ink sm:text-3xl">
            You already have a Cursor agent, an API key, and a GPU tab. None of
            them share a spend policy. That is the hole. That is Tuesday.
          </p>
        </section>

        <section className="grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: "Fund a policy",
              body: "A demo balance you can raise in one click. No card. No wallet popup. Money sits behind a rule, not a hope.",
            },
            {
              title: "Hard daily cap",
              body: "Default $50 a day. Editable. When the cap is hit, outbound spend stops. Not a suggestion.",
            },
            {
              title: "Allowlist only",
              body: "Domains and contract addresses your agents may pay. Everything else is a no, with a reason.",
            },
            {
              title: "Pause everything",
              body: "A kill switch that freezes all outbound spend. Resume when you mean it. Export the log as CSV.",
            },
          ].map((item) => (
            <article key={item.title} className="bg-card p-6 sm:p-7">
              <h2 className="font-serif text-2xl text-ink">{item.title}</h2>
              <p className="mt-3 text-[15px] leading-7 text-muted">{item.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-16 grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="font-serif text-3xl text-ink">The whole product</h2>
            <p className="mt-4 max-w-md text-[16px] leading-7 text-muted">
              Caps, allowlists, pause, and an audit log. We did not invent a
              new spend primitive. We put the four controls a founder actually
              needs on one calm page.
            </p>
          </div>
          <ol className="space-y-4 text-[16px] leading-7 text-ink">
            <li>
              <span className="font-medium">1.</span> Open the dashboard. The
              demo is already funded and seeded with agents.
            </li>
            <li>
              <span className="font-medium">2.</span> Change the cap. Edit the
              allowlist. Hit pause. Then try a spend and watch the verdict.
            </li>
            <li>
              <span className="font-medium">3.</span> Read the log. Who spent,
              where, how much, allowed or blocked, and why. Download CSV.
            </li>
          </ol>
        </section>

        <section
          id="not-this"
          className="mt-16 rounded-2xl border border-rule bg-pine px-6 py-10 text-card sm:px-10"
        >
          <h2 className="font-serif text-3xl">Not this</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <p className="text-[16px] leading-7 text-card/90">
              Not a protocol. Not a token. Not a bank. Not a Fortune 500
              treasury product. No whitepaper. No waitlist-only landing page
              that hides the product.
            </p>
            <p className="text-[16px] leading-7 text-card/90">
              Cards, USDC settlement, and multi-user auth are later. v0 is a
              local app you can run this afternoon and understand in one
              minute.
            </p>
          </div>
          <Link
            href="/app"
            className="mt-8 inline-flex rounded-full bg-card px-5 py-3 text-sm font-medium text-pine hover:bg-paper"
          >
            Open the dashboard
          </Link>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-5 py-8 text-sm text-muted sm:px-8">
        Spendlock v0 · Local demo · No API keys, no chain, no database service.
      </footer>
    </div>
  );
}
