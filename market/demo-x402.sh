#!/usr/bin/env bash
# An outside agent buys verified Hyperliquid wallets over plain HTTP (x402-style 402 -> pay -> retry),
# on a local blockchain. Play money only (MockUSDC on anvil); the checker reads the public Hyperliquid API.
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
cd "$(dirname "$0")"
(cd contracts && forge build -q)
anvil --silent & ANVIL_PID=$!
cd agents; export NETWORK=local PORT="${PORT:-4020}"
trap 'kill $ANVIL_PID ${SERVER_PID:-} 2>/dev/null || true' EXIT; sleep 2
node deploy.js
node x402-server.js & SERVER_PID=$!
for i in $(seq 50); do curl -sf "http://127.0.0.1:$PORT/health" >/dev/null && break; sleep 0.2; done
echo "== unpaid request (what any HTTP client sees):"
curl -s -o /dev/null -w "   HTTP %{http_code}\n" -X POST "http://127.0.0.1:$PORT/v1/hl-wallets?count=${1:-5}"
echo "== sample agent: read 402 terms -> lock USDC in escrow -> retry with X-PAYMENT"
node x402-agent-client.js --url "http://127.0.0.1:$PORT/v1/hl-wallets" --count "${1:-5}"
node balances.js
