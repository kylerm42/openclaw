# Testing Matrix Device Verification

This guide walks through testing the Matrix device verification feature from this repository without a global install.

## Prerequisites

1. **Matrix Account:** You need a Matrix account on any homeserver (matrix.org, beeper.com, etc.)
2. **Access Token:** Obtain an access token for your bot account
3. **Element Client:** Install Element desktop or use Element web to verify the device

## Setup

### Step 1: Get Matrix Access Token

Use the Matrix login API to get an access token:

```bash
curl --request POST \
  --url https://aurebesh.krm.dev/_matrix/client/v3/login \
  --header 'Content-Type: application/json' \
  --data '{
  "type": "m.login.password",
  "identifier": {
    "type": "m.id.user",
    "user": "k-2so"
  },
  "password": "Hcr30$SzC0!%E@bzWWoZCI"
}'
```

The response will include an `access_token` field. Copy this value.

### Step 2: Configure Test Settings

Edit `openclaw.test.json` in this repository:

```json
{
  "channels": {
    "matrix": {
      "enabled": true,
      "homeserver": "https://matrix.org",
      "accessToken": "YOUR_ACCESS_TOKEN_HERE",
      "encryption": true,
      "dm": {
        "policy": "allowlist",
        "allowFrom": ["@your-username:matrix.org"]
      }
    }
  }
}
```

Replace:

- `YOUR_ACCESS_TOKEN_HERE` → your actual access token from Step 1
- `@your-username:matrix.org` → your actual Matrix user ID

### Step 3: Install Matrix Plugin

```bash
pnpm openclaw plugins install ./extensions/matrix
```

## Testing Workflow

### Option A: Interactive Testing (Recommended)

**Terminal 1: Start Gateway**

```bash
./test-matrix.sh gateway run --bind loopback --port 18789
```

This runs the gateway in foreground mode. You'll see the emoji display directly in this terminal.

**What to expect:**

1. Gateway starts and connects to Matrix
2. Log message: "Verification request sent - check Element"
3. Within 5-10 seconds, you should see the ASCII emoji box

**Terminal 2: Element Client**

1. Open Element desktop or web
2. Look for "New login needs verification" notification
3. Click "Verify"
4. Element displays 7 emoji

**Terminal 3: Compare & Confirm**

```bash
# Check current status
./test-matrix.sh matrix verify status

# If emoji match exactly, confirm
./test-matrix.sh matrix verify confirm

# If emoji don't match (CRITICAL), cancel
./test-matrix.sh matrix verify cancel
```

### Option B: Background Testing

**Start gateway in background:**

```bash
pkill -9 -f openclaw-gateway || true
./test-matrix.sh gateway run --bind loopback --port 18789 > /tmp/openclaw-matrix-test.log 2>&1 &
```

**Tail logs to see emoji:**

```bash
tail -f /tmp/openclaw-matrix-test.log
```

**Run CLI commands:**

```bash
./test-matrix.sh matrix verify status
./test-matrix.sh matrix verify confirm
```

## Expected Behavior

### Success Indicators ✅

1. **Gateway logs show:**

   ```
   Verification request sent - check Element
   ```

2. **Element notification appears** within 5-10 seconds

3. **Emoji display in gateway terminal:**

   ```
   ╔════════════════════════════════════════════════════╗
   ║          DEVICE VERIFICATION EMOJI                 ║
   ╠════════════════════════════════════════════════════╣
   ║                                                    ║
   ║  🐶 Dog        🐱 Cat       🦁 Lion       🐎 Horse ║
   ║  🦄 Unicorn    🐷 Pig       🐘 Elephant             ║
   ║                                                    ║
   ╚════════════════════════════════════════════════════╝
   ```

4. **Status command shows active session:**

   ```bash
   ./test-matrix.sh matrix verify status
   ```

   Output should show:
   - Device ID
   - Active verification session
   - 7 emoji displayed
   - Expiry countdown

5. **After confirmation:**
   - Element shows device as verified (green checkmark)
   - No "unverified device" warnings in encrypted rooms

### Failure Indicators ❌

1. **No Element notification:**
   - Check Matrix connection: `./test-matrix.sh channels status`
   - Verify encryption enabled in config
   - Check gateway logs for errors

2. **Emoji mismatch (CRITICAL):**
   - **DO NOT CONFIRM**
   - This indicates a bug or MITM attack
   - Cancel verification: `./test-matrix.sh matrix verify cancel`
   - Report the issue

3. **Gateway crashes:**
   - Check logs: `tail -100 /tmp/openclaw-matrix-test.log`
   - Look for stack traces
   - Report with full logs

4. **"No active verification session":**
   - Gateway may have restarted
   - Restart gateway to trigger new request

## Verification Commands

### Check Status

```bash
./test-matrix.sh matrix verify status
```

Shows:

- Device ID
- Verification state (verified/unverified/pending)
- Active session details (emoji, expiry)
- Instructions

### Confirm Verification

```bash
./test-matrix.sh matrix verify confirm
```

Use this **only** if emoji match exactly between OpenClaw and Element.

### Cancel Verification

```bash
./test-matrix.sh matrix verify cancel
```

Cancels active verification session. Use if emoji mismatch or testing cancellation flow.

## Troubleshooting

### Config Issues

**Check current config:**

```bash
cat openclaw.test.json
```

**Verify config is being used:**

```bash
./test-matrix.sh config get channels.matrix.enabled
./test-matrix.sh config get channels.matrix.encryption
```

### Connection Issues

**Check Matrix connection:**

```bash
./test-matrix.sh channels status --probe
```

**View recent gateway logs:**

```bash
tail -n 200 /tmp/openclaw-matrix-test.log
```

### Plugin Issues

**List installed plugins:**

```bash
./test-matrix.sh plugins list
```

**Reinstall Matrix plugin:**

```bash
pnpm openclaw plugins install ./extensions/matrix --force
```

## Cleanup

**Kill test gateway:**

```bash
pkill -9 -f openclaw-gateway
```

**Remove test config (optional):**

```bash
rm openclaw.test.json
```

**Keep test data for debugging:**

- Gateway logs: `/tmp/openclaw-matrix-test.log`
- Matrix state: `~/.openclaw/matrix/`
- Sessions: `~/.openclaw/sessions/`

## Reporting Issues

If you encounter bugs during testing, please include:

1. **Gateway logs:**

   ```bash
   tail -200 /tmp/openclaw-matrix-test.log
   ```

2. **Config (redact access token):**

   ```bash
   cat openclaw.test.json | sed 's/"accessToken": ".*"/"accessToken": "REDACTED"/'
   ```

3. **Verification status:**

   ```bash
   ./test-matrix.sh matrix verify status
   ```

4. **Element behavior:**
   - Screenshot of notification
   - Screenshot of emoji display
   - Verification outcome

5. **Steps to reproduce**

## Related Documentation

- **Spec:** `.holocode/proposed/20260212-matrix-device-verification/SPEC.md`
- **Implementation:** `.holocode/implemented/matrix-device-verification.md`
- **User Docs:** `docs/channels/matrix.md`
- **Matrix Spec:** https://spec.matrix.org/v1.11/client-server-api/#device-verification
