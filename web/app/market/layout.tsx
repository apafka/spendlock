import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Market demo — verified Hyperliquid wallets",
  description:
    "No-wallet demo: post a budget, fund escrow from a capped Spendlock vault, watch Hyperliquid wallets get checked, and see pay-per-pass settlement. Simulated USDC only.",
};

export default function MarketLayout({ children }: { children: ReactNode }) {
  return children;
}
