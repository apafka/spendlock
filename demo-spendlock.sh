#!/usr/bin/env bash
# Spendlock local checks. Play money only. Never mainnet.
#   ./demo-spendlock.sh          run contract tests
#   KEEP=1 ./demo-spendlock.sh   also leave anvil running with a deployed vault
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "== contract tests =="
(cd contracts && forge test)

echo
echo "Browser demo (no wallet, simulated state):"
echo "  cd web && npm install && npm run dev"
echo "  open http://localhost:3000/spendlock/       landing"
echo "  open http://localhost:3000/spendlock/demo/  Agent Profiles"
echo "  open http://localhost:3000/spendlock/market/  pay-per-verified-wallet job"

echo
echo "x402 Agent Profiles demo (no chain):"
echo "  cd agents && npm install && npm test && npm run demo"

if [ -z "${KEEP:-}" ]; then
  echo
  echo "Optional local chain: KEEP=1 ./demo-spendlock.sh"
  exit 0
fi

echo
echo "== local anvil deploy (play money) =="
if ! command -v anvil >/dev/null; then
  echo "anvil not found. Install Foundry: https://book.getfoundry.sh/getting-started/installation"
  exit 1
fi
anvil --silent &
ANVIL_PID=$!
trap 'echo "anvil still running (pid $ANVIL_PID). kill $ANVIL_PID to stop."' EXIT
sleep 1
# Anvil account 0 is a well-known *public* test key. Local play money only.
ANVIL_0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
(cd contracts && forge script script/Deploy.s.sol --broadcast --rpc-url http://127.0.0.1:8545 --private-key "$ANVIL_0")
echo
echo "Set SPENDLOCK_VAULT in agents/.env to the spendlock address printed above."
echo "MCP: cd agents && npm install && node spendlock-mcp.js"
echo "Owner CLI: node agents/spendlock-owner.js status"
