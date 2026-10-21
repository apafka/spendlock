#!/usr/bin/env bash
# Spendlock demo on a local blockchain (play money). An owner funds a vault, sets agent rules, and
# agent A buys verified Hyperliquid wallets through ResultEscrow using only its Spendlock allowance.
# The wallet checker reads the public Hyperliquid API, so this needs internet.
#   ./demo-spendlock.sh            run and stop
#   KEEP=1 ./demo-spendlock.sh     leave anvil running afterwards (for the dashboard: cd web && npm run dev -> /spendlock)
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
cd "$(dirname "$0")"
(cd contracts && forge build -q)
anvil --silent & ANVIL_PID=$!
[ -n "${KEEP:-}" ] || trap 'kill $ANVIL_PID' EXIT
sleep 2
cd agents; export NETWORK=local
node deploy.js
node deploy-spendlock.js
node demo-spendlock.js
[ -z "${KEEP:-}" ] || echo "anvil still running (pid $ANVIL_PID). Dashboard: cd web && npm run dev, then open http://localhost:3000/spendlock"
