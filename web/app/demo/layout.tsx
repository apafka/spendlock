import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Agent Profiles — Spendlock demo",
  description:
    "No-wallet Agent Profiles: per-agent budget, approval rule, purchase history, pause/delete, and a three-seller x402 run. Simulated play money.",
};

export default function DemoLayout({ children }: { children: ReactNode }) {
  return children;
}
