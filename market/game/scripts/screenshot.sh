#!/usr/bin/env bash
# Headless Chrome screenshots of the running site (start it first: cd web && npm start).
set -e
cd "$(dirname "$0")/.."
URL=${URL:-http://localhost:3000}
CH=${CHROME:-google-chrome}
shot() { "$CH" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=$3 --screenshot="$2" "$URL$1" 2>/dev/null; echo "saved $2"; }
shot /game/leaderboard screenshot.png 1280,1100
shot /game screenshot-draft.png 1280,1400
curl -sf "$URL/game/card/${CARD_PLAYER:-degen_dana}" -o card-example.png && echo "saved card-example.png"
