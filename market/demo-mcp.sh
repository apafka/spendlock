#!/usr/bin/env bash
# An outside agent buys verified Hyperliquid wallets over MCP, on a local blockchain. No real money.
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
cd "$(dirname "$0")"
(cd contracts && forge build -q)
anvil --silent & ANVIL_PID=$!; trap 'kill $ANVIL_PID' EXIT; sleep 2
cd agents; export NETWORK=local
node deploy.js
node demo-agent-buyer.js --count "${1:-5}"
node balances.js
