import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Dashboard — Spendlock",
  description:
    "Fund a policy, set a daily cap, allowlist merchants, pause spend, and export the log.",
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return children;
}
