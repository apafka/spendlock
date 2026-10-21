#!/usr/bin/env bash
# End-to-end wallet job on a local blockchain: real Hyperliquid candidates, live checker. No real money.
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
cd "$(dirname "$0")"
(cd contracts && forge build -q)
anvil --silent & ANVIL_PID=$!; trap 'kill $ANVIL_PID' EXIT; sleep 2
cd agents; export NETWORK=local
node deploy.js
echo "== feed: real candidates from the public Hyperliquid leaderboard"; node feed-hl.js --n 100
node post-job.js --spec data/hl-wallets-spec.json
node worker.js --job 1 --candidates data/hl-candidates.csv
echo "== checker: live Hyperliquid info API"; node verifier.js --job 1
node balances.js
