#!/usr/bin/env bash
# Spendlock one-command quickstart. Local anvil or Base Sepolia. Play money only.
#   ./quickstart.sh              start vault + sellers, print MCP config, stay up
#   ./quickstart.sh --verify     same, then scripted paid / blocked / waiting / verified / not-paid
set -euo pipefail
export PATH="${HOME}/.foundry/bin:${PATH}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

need_cmd() { command -v "$1" >/dev/null 2>&1; }

if ! need_cmd node; then
  echo "Node.js 22+ is required: https://nodejs.org/"
  exit 1
fi

if ! need_cmd forge || ! need_cmd anvil; then
  echo "Foundry (forge + anvil) not found."
  if [ -t 0 ] && [ "${SPENDLOCK_INSTALL_FOUNDRY:-1}" != "0" ]; then
    echo "Installing Foundry into ~/.foundry (local play-money chain)..."
    curl -L https://foundry.paradigm.xyz | bash
    "${HOME}/.foundry/bin/foundryup"
    export PATH="${HOME}/.foundry/bin:${PATH}"
  else
    echo "Install: curl -L https://foundry.paradigm.xyz | bash && foundryup"
    echo "Then add ~/.foundry/bin to PATH."
    exit 1
  fi
fi

if [ ! -f contracts/lib/forge-std/src/Test.sol ]; then
  echo "Installing contract libraries..."
  if [ -d .git ]; then
    git submodule update --init --recursive
  fi
  (cd contracts && forge install --no-git)
fi

if [ ! -d agents/node_modules/@modelcontextprotocol ]; then
  echo "Installing agent dependencies..."
  (cd agents && npm ci)
fi

exec node agents/quickstart.js "$@"
