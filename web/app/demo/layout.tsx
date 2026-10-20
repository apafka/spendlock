import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Demo — Spendlock owner dashboard",
  description:
    "Simulated Spendlock vault: per-agent caps, allowlist, owner approval, kill switch, readable log. No wallet required.",
};

export default function DemoLayout({ children }: { children: ReactNode }) {
  return children;
}
