#!/usr/bin/env bash
# End-to-end demo on a local blockchain. Nothing real, no real money.
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
cd "$(dirname "$0")"
echo "== 1. compile + test contracts"; (cd contracts && forge build -q && forge test 2>&1 | grep -E "Suite result")
echo "== 2. test verifier rules";   (cd agents && node --test 2>&1 | grep -E '^# (pass|fail)')
echo "== 3. start local chain (anvil)"
anvil --silent & ANVIL_PID=$!; trap 'kill $ANVIL_PID' EXIT; sleep 2
cd agents; export NETWORK=local
echo "== 4. deploy";            node deploy.js
echo "== 5. client posts job #1: real sourced BESS candidates (data/bess-candidates.csv)"
node post-job.js --spec data/bess-spec.json
echo "-- balances after funding"; node balances.js
echo "== 6. worker delivers";   node worker.js --job 1 --candidates data/bess-candidates.csv
echo "== 7. verifier checks + settles (live DNS, homepage + source-page checks)"; node verifier.js --job 1
echo "== 8. job #2: synthetic list with planted bad rows, to show failure reasons"
node post-job.js --spec data/demo-spec.json
node worker.js --job 2 --candidates data/candidates.csv
node verifier.js --job 2
echo "-- balances after both settlements"; node balances.js
