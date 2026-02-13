# Research Summary: Matrix Device Verification

This document captures research conducted to understand Matrix E2EE device verification and inform the implementation approach for OpenClaw.

## Research Questions Answered

### 1. How does Matrix encryption and device verification work?

**Key Findings:**

- **E2EE is separate from verification:** Messages can be encrypted without device verification. Encryption protects against network eavesdropping; verification protects against impersonation/MITM.

- **Two-layer crypto system:**
  - **Olm (1:1):** Signal-based Double Ratchet protocol for device-to-device encryption
  - **Megolm (group):** Efficient group encryption that extends Olm for multi-user rooms

- **Three types of keys:**
  - **Identity Keys (Ed25519):** Long-term signing keys that identify a device
  - **Device Keys (Curve25519):** Used for Olm sessions
  - **One-Time Keys (Curve25519):** Pre-generated disposable keys for forward secrecy

- **Server role:** Acts as encrypted message relay (zero-access); cannot decrypt messages but routes them and stores public keys.

### 2. What is device verification and why is it needed?

**What "Encrypted by a device not verified by its owner" means:**

- The message **is encrypted** (good for privacy)
- But the sending device hasn't been verified through cross-signing by its owner
- You can't be 100% sure it's really them (could theoretically be an imposter device)

**Trust hierarchy:**

```
User's Master Key
    ↓
Self-Signing Key (signs own devices)
    ↓
Device Keys
```

When a user verifies their device with their self-signing key, the signature is uploaded to the server. Other users' clients download this signature and can see the device is verified by its owner.

### 3. How do other Matrix bots handle verification?

**Patterns from matrix-nio (Python):**

- **Accept-only approach:** Bot doesn't initiate verification; it accepts verification requests from Element/other clients
- **Interactive emoji verification:** Bot displays 7 emoji pairs in terminal/logs; user confirms match
- **Manual verification option:** For bots with known device IDs, can pre-trust programmatically (security tradeoff)

**Typical bot verification flow:**

1. User opens Element, goes to bot's device list
2. User clicks "Verify" → sends `m.key.verification.request` to bot
3. Bot accepts request, negotiates SAS method
4. Bot computes and displays emoji
5. User confirms emoji match in bot's CLI/logs
6. Bot completes verification, device marked as verified

**Key insight:** Headless/CLI bots don't need to initiate verification; the "verify in Element" pattern is standard and simpler.

### 4. What verification methods are practical for CLI environments?

**SAS (Short Authentication String) with Emoji:**

- ✅ Works well in terminal (emoji display)
- ✅ Standard method supported by all clients
- ✅ Security properties well-understood
- ❌ Requires human interaction (but that's acceptable)

**QR Codes:**

- ✅ Can be rendered in terminal (ASCII/Unicode blocks)
- ✅ Faster than emoji comparison
- ❌ More complex to implement
- ❌ Requires camera on verifying device
- **Decision:** Defer to future enhancement

**Cross-Signing:**

- ✅ Automatic once initial verification done
- ✅ New devices auto-trusted after self-verification
- ✅ Matrix's recommended approach
- ℹ️ Happens automatically after device verification; no extra implementation needed

**"Trust on First Use" (not standard):**

- ✅ Fully automatic
- ❌ Major security risk (vulnerable to MITM)
- ❌ Not a Matrix standard
- **Decision:** Rejected for security reasons

### 5. Does @vector-im/matrix-bot-sdk support verification?

**Definitive answer: NO.**

**Evidence:**

1. Examined complete source code of `CryptoClient` class (344 lines)
2. No `requestOwnUserVerification()` method exists
3. No other verification-related methods exposed
4. Comprehensive search found zero verification APIs
5. Confirmed by upstream GitHub issue #82 (feature request opened Jan 27, 2026)

**Why the current code doesn't crash:**

```typescript
const verificationRequest = await (
  client.crypto as { requestOwnUserVerification?: () => Promise<unknown> }
).requestOwnUserVerification?.();
```

- Optional chaining (`?.()`) returns `undefined` if method doesn't exist
- Try-catch block catches any errors
- Code continues normally, but verification silently fails

**Underlying Rust SDK:** Also lacks device verification APIs (only backup verification exists).

### 6. Can we implement verification ourselves?

**Yes, via Matrix Client-Server API.**

**Required endpoints:**

- `/keys/query` - Query device keys
- `/keys/upload` - Upload device keys (already working)
- `/sendToDevice/{eventType}/{txnId}` - Send to-device messages

**Verification event types:**

- `m.key.verification.request` - Initiate verification
- `m.key.verification.start` - Start verification with method
- `m.key.verification.accept` - Accept method
- `m.key.verification.key` - Exchange public keys
- `m.key.verification.mac` - Exchange MACs (completion)
- `m.key.verification.cancel` - Cancel verification

**SAS emoji computation:**

- HKDF-SHA256 key derivation
- Concatenate public keys (lexicographically sorted)
- Derive 6 bytes → 7 emoji indices
- Map to standard 64-emoji list

**Implementation pattern:** Similar to how `matrix-nio` bots handle verification, adapted to Node.js/TypeScript.

## Key Technical Decisions

### Decision 1: Implement at Client-Server API Level

**Why:** SDK lacks support; upstream has no ETA; users need this feature now.

**Trade-offs:**

- ✅ Full control over implementation
- ✅ Can adapt to OpenClaw's CLI UX
- ❌ More code to maintain
- ❌ Must handle edge cases ourselves

**Mitigation:** Isolate verification code in separate module; monitor upstream SDK for future native support.

### Decision 2: Accept-Only (Don't Initiate)

**Why:** Bot doesn't need to initiate; users will verify from Element. Simpler implementation.

**Trade-offs:**

- ✅ Simpler state machine
- ✅ Less UI complexity
- ✅ Matches pattern of other headless bots
- ❌ Slightly less convenient (but acceptable)

### Decision 3: CLI Commands for Confirmation

**Why:** OpenClaw is a CLI tool; terminal-based UX fits existing patterns.

**Commands:**

- `openclaw matrix verify-status` - Show device ID, verification state, instructions
- `openclaw matrix verify confirm` - Confirm emoji match and complete verification
- `openclaw matrix verify cancel` - Cancel active verification

**Trade-offs:**

- ✅ Consistent with OpenClaw's CLI-first design
- ✅ Simple to implement and document
- ❌ Requires user to switch contexts (Element → terminal → CLI)
- ❌ Not as polished as web UI

**Mitigation:** Clear logging with box-drawing around emoji for visibility; comprehensive docs.

### Decision 4: SAS Emoji Only (No QR)

**Why:** QR codes in terminal are complex; emoji verification is sufficient for bot verification.

**Trade-offs:**

- ✅ Simpler implementation
- ✅ Standard method supported everywhere
- ❌ Slightly slower than QR scanning

**Future enhancement:** QR code support can be added later if user demand justifies it.

## Security Considerations

### Critical Security Properties

1. **Emoji comparison is the security anchor:** User must visually confirm emoji match. Mismatch indicates MITM attack or implementation bug.

2. **No automatic approval:** Verification requires explicit user confirmation. This is a security feature, not a bug.

3. **Transaction ID validation:** Must validate transaction IDs match to prevent replay attacks.

4. **Key validation:** Must verify public keys are valid Curve25519 keys before processing.

5. **Timeout enforcement:** Expire verification sessions after 10 minutes to prevent stale sessions.

### Threat Model

**Threats mitigated:**

- ✅ MITM device impersonation (emoji mismatch would be detected)
- ✅ Malicious verification requests (user confirmation required)
- ✅ Replay attacks (transaction ID validation)

**Threats NOT mitigated:**

- ❌ Compromised homeserver (inherent Matrix trust model)
- ❌ User ignoring emoji mismatch (human error)
- ❌ Screen recording during verification (acceptable risk)

### Failure Modes

- **Network errors:** Retry with exponential backoff; timeout after 3 attempts
- **Gateway restart during verification:** Session lost; user must restart from Element (acceptable)
- **Malformed events:** Validate and reject; log warnings
- **Multiple simultaneous requests:** Handle queue; process one at a time

## Alternative Approaches Rejected

### 1. Wait for SDK Support

**Rejected:** No ETA; feature missing for years; blocks users indefinitely.

### 2. Switch to matrix-js-sdk

**Rejected:** Too heavy; requires major refactor; bot-sdk is purpose-built for bots.

### 3. Auto-Approve Verification

**Rejected:** Major security risk; enables MITM attacks; violates Matrix security model.

### 4. Web UI for Verification

**Rejected:** Adds complexity; not CLI-native; overkill for bot verification.

## References

### Matrix Specification

- Device Verification: https://spec.matrix.org/v1.11/client-server-api/#device-verification
- SAS Verification: https://spec.matrix.org/v1.11/client-server-api/#short-authentication-string-sas-verification
- SAS Emoji List: https://spec.matrix.org/v1.11/client-server-api/#sas-method-emoji

### Upstream Issues

- matrix-bot-sdk #82: https://github.com/element-hq/matrix-bot-sdk/issues/82
- OpenClaw #9892: https://github.com/openclaw/openclaw/issues/9892

### Reference Implementations

- matrix-nio (Python): https://github.com/poljar/matrix-nio
- matrix-js-sdk (Element's SDK): https://github.com/matrix-org/matrix-js-sdk
- gomuks (Terminal Matrix client): https://github.com/tulir/gomuks

### Educational Resources

- Matrix E2EE Primer: https://matrix.org/docs/matrix-concepts/end-to-end-encryption/
- Olm/Megolm Spec: https://gitlab.matrix.org/matrix-org/olm
- Signal Protocol (basis for Olm): https://signal.org/docs/

## Open Questions for Implementation

1. **Emoji display format:** Single line, table, or ASCII art box? (Recommendation: ASCII art box for visibility)
2. **Verification timeout warnings:** Log warning at 8 minutes? (Recommendation: Yes)
3. **Multiple device support:** Handle multiple devices from same user? (Recommendation: Queue, process one at a time)
4. **Persistence:** Store verification history? (Recommendation: Store device verified state, not full history)
5. **Cross-signing status:** Should `verify-status` show cross-signing info? (Recommendation: Future enhancement)

## Conclusion

**Implementation is feasible and necessary.** While the SDK lacks verification support, we can implement it at the Client-Server API level using patterns from other Matrix bots. The accept-only, CLI-based approach aligns with OpenClaw's design philosophy and provides the security properties users need.

**User benefit:** Eliminates "unverified device" warnings in encrypted rooms, enables full E2EE participation with trust signals.

**Maintenance burden:** Moderate; isolated code; can migrate to SDK if/when upstream adds support.

**Security posture:** Strong; requires explicit user confirmation; follows Matrix security model.

**Recommendation:** Proceed with implementation as specified in SPEC.md.
