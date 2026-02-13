#!/usr/bin/env bash
set -euo pipefail

# Matrix Device Verification Testing Script
# This script runs OpenClaw from the repo with a local test config

# Set config path to local test file
export OPENCLAW_CONFIG_PATH="$(pwd)/openclaw.test.json"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 Matrix Device Verification Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Config: $OPENCLAW_CONFIG_PATH"
echo ""
echo "⚠️  BEFORE STARTING:"
echo "   1. Edit openclaw.test.json with your Matrix credentials:"
echo "      - homeserver (e.g., https://matrix.org)"
echo "      - accessToken (get from Matrix login API)"
echo "      - allowFrom (your Matrix user ID)"
echo ""
echo "   2. Ensure Matrix plugin is installed:"
echo "      pnpm openclaw plugins install ./extensions/matrix"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if config has been customized
if grep -q "REPLACE_WITH_YOUR_ACCESS_TOKEN" openclaw.test.json; then
    echo "❌ Config not customized yet!"
    echo ""
    echo "Please edit openclaw.test.json and replace:"
    echo "  - REPLACE_WITH_YOUR_ACCESS_TOKEN → your Matrix access token"
    echo "  - @your-username:matrix.org → your actual Matrix user ID"
    echo ""
    exit 1
fi

# Pass through any arguments to the CLI
pnpm openclaw "$@"
