#!/usr/bin/env sh
# Install the gateway as a login service on this Mac.
#
#   SERVER_URL=https://api.example.com GATEWAY_TOKEN=... scripts/gateway-install.sh
#   scripts/gateway-install.sh --uninstall
#
# Builds the bundle, writes ~/Library/LaunchAgents/com.sbta.gateway.plist with
# real paths, and loads it. Re-running replaces the previous installation.
set -eu

LABEL=com.sbta.gateway
REPO=$(cd "$(dirname "$0")/.." && pwd)
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "removed $LABEL"
  exit 0
fi

# The .env is the same one the dev commands use; explicit env wins over it.
if [ -f "$REPO/.env" ]; then
  set -a; . "$REPO/.env"; set +a
fi
: "${GATEWAY_TOKEN:?GATEWAY_TOKEN is required (server and gateway must agree on it)}"
SERVER_URL=${SERVER_URL:-http://localhost:4310}
GATEWAY_ID=${GATEWAY_ID:-$(scutil --get ComputerName 2>/dev/null || hostname)}
NODE=$(command -v node)

echo "building gateway bundle"
(cd "$REPO" && npx nx run gateway:build --output-style=static >/dev/null)

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
sed -e "s|__NODE__|$NODE|g" \
    -e "s|__REPO__|$REPO|g" \
    -e "s|__HOME__|$HOME|g" \
    -e "s|__SERVER_URL__|$SERVER_URL|g" \
    -e "s|__GATEWAY_TOKEN__|$GATEWAY_TOKEN|g" \
    -e "s|__GATEWAY_ID__|$GATEWAY_ID|g" \
    "$REPO/apps/gateway/launchd/$LABEL.plist" > "$PLIST"
chmod 600 "$PLIST"   # it carries the token

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"

cat <<MSG

installed $LABEL
  server   $SERVER_URL
  id       $GATEWAY_ID
  node     $NODE
  logs     tail -f ~/Library/Logs/sbta-gateway.log

Under launchd the permissions belong to node itself, not a terminal app.
Grant Full Disk Access and Automation to:  $NODE
The dashboard's permission banner will show what is still missing.
MSG
