#!/bin/bash
# Open portal-dev.unitpulse.ai with Google SSO login via playwright-cli
#
# Requires: playwright-cli (npm install -g @playwright/cli@latest)
#
# Usage: bash open_portal.sh [email] [password]
#   With no args: opens the browser, you log in manually
#   With args:     auto-fills Google login (not recommended — Google may block it)

NODE="D:/node.js/node"
CLI="C:/Users/xuqin/AppData/Roaming/npm/node_modules/@playwright/cli/playwright-cli.js"
PLAYWRIGHT="$NODE $CLI"
URL="https://portal-dev.unitpulse.ai/messages/prospects"
EMAIL="${1:-}"
PASSWORD="${2:-}"

echo "=== Opening $URL ==="

# Step 1: Open the page
echo "[1] Navigating to portal..."
$PLAYWRIGHT open "$URL" 2>&1

sleep 2

# Step 2: Take snapshot and find the Google button
echo "[2] Looking for login button..."
SNAP=$($PLAYWRIGHT snapshot 2>&1)
echo "$SNAP"

# Check where we landed
if echo "$SNAP" | grep -q "Continue with Google"; then
    echo "-> Portal login page. Clicking 'Continue with Google'..."
    $PLAYWRIGHT click e28 2>&1
    sleep 3

elif echo "$SNAP" | grep -q "accounts.google.com"; then
    echo "-> Already on Google SSO page."
fi

# Step 3: If email/password provided, fill them
if [ -n "$EMAIL" ]; then
    echo "[3] Filling email: $EMAIL"
    SNAP=$($PLAYWRIGHT snapshot 2>&1)

    if echo "$SNAP" | grep -q "邮箱或电话号码"; then
        $PLAYWRIGHT fill e28 "$EMAIL" --submit 2>&1
        sleep 3

        if [ -n "$PASSWORD" ]; then
            SNAP=$($PLAYWRIGHT snapshot 2>&1)
            if echo "$SNAP" | grep -q "输入密码"; then
                echo "[4] Filling password..."
                $PLAYWRIGHT fill e28 "$PASSWORD" --submit 2>&1
            fi
        fi
    fi
fi

# Step 4: Wait for redirect back to portal
echo "[5] Waiting for login to complete (up to 3 min)..."
for i in $(seq 1 36); do
    sleep 5
    URL_CURRENT=$($PLAYWRIGHT eval "window.location.href" 2>&1)
    echo "    Current URL: $URL_CURRENT"
    if echo "$URL_CURRENT" | grep -q "portal-dev.unitpulse.ai"; then
        echo "-> Logged in and redirected back to portal!"
        break
    fi
done

# Step 5: Final screenshot
echo "[6] Taking final screenshot..."
$PLAYWRIGHT screenshot --filename="D:/test_project/screenshots/final.png" 2>&1

# Save auth state
echo "[7] Saving auth state..."
$PLAYWRIGHT state-save "D:/test_project/auth_state.json" 2>&1

echo "=== Done ==="
