import Link from "next/link";
import { SpendlockMark } from "./mark";

export function SiteHeader({
  actionHref,
  actionLabel,
}: {
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
      <Link href="/" className="flex items-center gap-2.5">
        <SpendlockMark />
        <span className="font-serif text-xl tracking-tight text-ink">Spendlock</span>
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/market" className="hidden text-muted hover:text-ink sm:inline">
          Market
        </Link>
        <Link href="/#why-now" className="hidden text-muted hover:text-ink sm:inline">
          Why now
        </Link>
        <Link href="/#pricing" className="hidden text-muted hover:text-ink sm:inline">
          Pricing
        </Link>
        <Link
          href={actionHref}
          className="rounded-full bg-pine px-4 py-2 text-sm font-medium text-card transition-colors hover:bg-pine-deep"
        >
          {actionLabel}
        </Link>
      </nav>
    </header>
  );
}
