# Specification Updates

## Changes Made Based on Review Feedback

### 1. Simplified to Bot-Initiated Only (Phase 1)

**Issue:** Original spec included both bot-initiated AND Element-initiated verification in Phase 1, increasing complexity.

**Fix:** Simplified to **bot-initiated only** for Phase 1, with Element-initiated deferred to Phase 2:

**Phase 1 (Bot-Initiated Only):**

- Bot sends `m.key.verification.request` on startup when E2EE enabled
- Element receives notification "New login needs verification"
- User clicks "Verify" in Element → Element accepts and starts SAS
- Bot handles incoming SAS events (ready, start, key, mac, done)
- Bot displays emoji, waits for user CLI confirmation
- ~85% of total code; all the hard parts (SAS protocol, crypto)

**Phase 2 (Element-Initiated - Future Enhancement):**

- User clicks "Verify" in Element device list anytime
- Bot receives `m.key.verification.request`
- Bot responds with `m.key.verification.ready`
- Bot sends `m.key.verification.start` to begin SAS
- Reuses 85% of Phase 1 SAS protocol code
- ~60-80 LOC addition (~15% more code)

**Rationale for Phasing:**

- Lower initial implementation risk
- Ships working solution faster
- Easy to add Element-initiated later (minimal refactoring)
- User workaround: restart gateway to trigger verification

**Updated Requirements:**

- Phase 1: Bot-initiated only + SAS protocol + CLI commands
- Phase 2: Added to "Future Enhancements" section
- Updated out-of-scope to reflect phasing
- Adjusted non-functional requirements

**Updated Implementation Tasks:**

- Phase 1 tasks focus on outgoing request + inbound SAS handling
- Phase 2 tasks detail Element-initiated addition (~5 additional tasks)
- Testing expanded to 6 test cases covering all scenarios
- Documentation updated to explain workaround (restart gateway)

### 2. Fixed Command Naming Consistency

**Issue:** Commands used inconsistent naming (hyphenated `verify-status` vs space-separated `verify confirm`).

**Fix:** Standardized all commands to use **spaces** (OpenClaw convention):

| Before                           | After                                        |
| -------------------------------- | -------------------------------------------- |
| `openclaw matrix verify-status`  | `openclaw matrix verify status`              |
| `openclaw matrix verify confirm` | `openclaw matrix verify confirm` (no change) |
| `openclaw matrix verify cancel`  | `openclaw matrix verify cancel` (no change)  |

**Updated Locations:**

- Requirements section (command specifications)
- Component diagram (CLI commands box)
- Implementation Tasks (Phase 3)
- Testing Strategy (CLI command tests)
- Manual Testing Checklist
- Future Enhancements section

### Architecture Implications

**Why Bot-Initiated Is Essential:**

Matrix device verification uses a **request/accept handshake**:

1. **Initiator** sends `m.key.verification.request` (can be either device)
2. **Responder** sends `m.key.verification.ready` to accept
3. **Initiator** OR **Responder** sends `m.key.verification.start` to choose method (SAS, QR, etc.)
4. Both devices proceed with interactive verification (SAS emoji exchange, MAC confirmation)

**For new bot devices:**

- Element expects the new/unverified device (bot) to initiate
- Element shows "Waiting for other device to accept" if Element tries to initiate
- Bot must send the initial `m.key.verification.request`

**Phase 1 Coverage:**

- Bot initiates (step 1) ✅
- Bot handles Element's acceptance (step 2) ✅
- Bot handles Element starting SAS (step 3) ✅
- Bot completes SAS protocol (step 4) ✅

**Phase 2 Addition:**

- Bot accepts Element-initiated requests (~15% more code)
- Enables on-demand verification without gateway restart
- Reuses entire SAS protocol implementation

**Code Reuse Analysis:**

- SAS protocol (emoji computation, MAC exchange, state machine): ~350-400 LOC - **100% shared**
- Bot-initiated handshake: ~80-100 LOC - Phase 1
- Element-initiated handler: ~60-80 LOC - Phase 2
- Total: ~500-580 LOC (85% Phase 1, 15% Phase 2)

### Security Note

Bidirectional support does NOT weaken security:

- User still must confirm emoji match (manual verification)
- Transaction IDs prevent replay attacks
- Either party can cancel at any time
- The initiator choice doesn't affect cryptographic security properties

### Testing Coverage

Updated manual testing checklist now includes 6 comprehensive test cases:

- **Test 1:** Happy path - bot-initiated verification (primary flow)
- **Test 2:** Verification status command (before/during/after verification)
- **Test 3:** Cancellation flow
- **Test 4:** Timeout handling (10 minute expiry)
- **Test 5:** Emoji mismatch (security test - MITM detection)
- **Test 6:** Gateway restart during verification (session loss)

This ensures the Phase 1 implementation is robust and handles all edge cases.

### Phase 2 Testing (When Implemented)

When Element-initiated support is added (~4-6 additional test cases):

- Element-initiated happy path
- Duplicate request handling
- Rejection flow
- Most Phase 1 tests can be reused for Phase 2

## Summary

The specification now accurately reflects:

1. ✅ **Phase 1:** Bot-initiated verification only (simpler, ships faster)
2. ✅ **Phase 2:** Element-initiated deferred to future enhancement
3. ✅ Consistent command naming (spaces, not hyphens)
4. ✅ Comprehensive testing for Phase 1 flows
5. ✅ Clear architectural rationale for phasing decision
6. ✅ ~85% code reuse between phases (low refactoring risk)

**Benefits of Phasing:**

- **Lower risk:** Phase 1 focuses on the hard parts (SAS protocol, crypto)
- **Faster shipping:** Users get working verification sooner
- **Easy extension:** Phase 2 adds ~15% more code with 85% reuse
- **Minimal UX impact:** Workaround is simple (restart gateway)

The implementation is ready to proceed with a streamlined Phase 1 scope.
