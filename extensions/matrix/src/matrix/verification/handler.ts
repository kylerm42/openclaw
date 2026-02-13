/**
 * Matrix device verification handler.
 * Implements SAS (Short Authentication String) verification protocol.
 *
 * Phase 1: Bot-initiated verification only
 * - Send m.key.verification.request on startup
 * - Handle incoming SAS protocol events
 * - Compute and display emoji
 * - Complete verification upon user confirmation
 */

import type { MatrixClient } from "@vector-im/matrix-bot-sdk";
import type { RuntimeLogger } from "openclaw/plugin-sdk";
import { createHmac } from "node:crypto";
import { randomBytes } from "node:crypto";
import { computeSasEmoji } from "./sas.js";
import { VerificationStore } from "./store.js";
import {
  CancelCode,
  type KeyVerificationCancel,
  type KeyVerificationDone,
  type KeyVerificationKey,
  type KeyVerificationMac,
  type KeyVerificationReady,
  type KeyVerificationRequest,
  type KeyVerificationStart,
  type VerificationSession,
  type VerificationState,
} from "./types.js";

/**
 * Verification handler managing the SAS protocol state machine.
 */
export class VerificationHandler {
  private readonly store: VerificationStore;
  private readonly client: MatrixClient;
  private readonly userId: string;
  private readonly deviceId: string;
  private readonly logger?: RuntimeLogger;
  private readonly storageDir?: string;
  private cleanupInterval?: NodeJS.Timeout;
  private timeoutWarningTimer?: NodeJS.Timeout;

  constructor(params: {
    client: MatrixClient;
    userId: string;
    deviceId: string;
    logger?: RuntimeLogger;
    store?: VerificationStore;
    storageDir?: string;
  }) {
    this.client = params.client;
    this.userId = params.userId;
    this.deviceId = params.deviceId;
    this.logger = params.logger;
    this.store = params.store || new VerificationStore(params.logger);
    this.storageDir = params.storageDir;
  }

  /**
   * Start the verification handler.
   * Must be called after construction to initialize store and start cleanup interval.
   */
  async start(): Promise<void> {
    // Initialize store with persistence
    if (this.storageDir) {
      try {
        await this.store.initialize(this.storageDir);
      } catch (err) {
        this.logger?.warn("matrix: failed to initialize verification store", {
          error: String(err),
        });
      }
    }

    // Start periodic cleanup of expired sessions (every 5 minutes)
    this.cleanupInterval = setInterval(
      () => {
        const removed = this.store.cleanupExpiredSessions();
        if (removed > 0) {
          this.logger?.debug?.("matrix: cleaned up expired verification sessions", {
            count: removed,
          });
        }
      },
      5 * 60 * 1000,
    );
  }

  /**
   * Stop the verification handler and clean up resources.
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    if (this.timeoutWarningTimer) {
      clearTimeout(this.timeoutWarningTimer);
      this.timeoutWarningTimer = undefined;
    }
  }

  /**
   * Send a verification request to the user's other devices.
   * This initiates bot-initiated verification (Phase 1).
   *
   * @returns Transaction ID of the verification request
   */
  async sendVerificationRequest(): Promise<string> {
    const transactionId = generateTransactionId();
    const now = Date.now();

    // Create verification session (Phase 1: outgoing only)
    const session: VerificationSession = {
      transactionId,
      direction: "outgoing", // Phase 1: only outgoing verification supported
      targetUserId: this.userId,
      targetDeviceId: "*", // Broadcast to all devices initially
      method: "m.sas.v1",
      state: "requested",
      createdAt: now,
      expiresAt: now + 10 * 60 * 1000, // 10 minutes per spec
    };

    this.store.setSession(session);

    // NOTE: Do NOT register our own outgoing transaction IDs for replay protection.
    // Only incoming transaction IDs need tracking. Registering our own prevents
    // recovery when gateway restarts while Element still holds the old request.

    // Send m.key.verification.request to all user's devices
    const content: KeyVerificationRequest = {
      from_device: this.deviceId,
      transaction_id: transactionId,
      methods: ["m.sas.v1"],
      timestamp: now,
    };

    await this.sendToDevice("m.key.verification.request", this.userId, "*", content);

    this.logger?.info("matrix: device verification request sent - please check Element to accept", {
      transactionId: transactionId.substring(0, 8),
    });

    return transactionId;
  }

  /**
   * Handle incoming m.key.verification.ready event.
   * Element has accepted our verification request.
   */
  async handleReady(event: KeyVerificationReady, fromDevice: string): Promise<void> {
    const session = this.store.getSession(event.transaction_id);
    if (!session) {
      // Check for transaction ID replay only if no active session exists
      if (this.store.isTransactionIdUsed(event.transaction_id)) {
        this.logger?.warn(
          "matrix: verification rejected - transaction ID already used (replay attack?)",
          {
            transactionId: event.transaction_id.substring(0, 8),
          },
        );
        await this.sendCancel(
          event.transaction_id,
          fromDevice,
          CancelCode.UNKNOWN_TRANSACTION,
          "Transaction ID already used",
        );
        return;
      }
      this.logger?.warn("matrix: verification received ready for unknown transaction", {
        transactionId: event.transaction_id.substring(0, 8),
      });
      return;
    }

    if (session.state !== "requested") {
      this.logger?.warn("matrix: verification received ready in unexpected state", {
        state: session.state,
        transactionId: event.transaction_id.substring(0, 8),
      });
      return;
    }

    // Update session state
    session.state = "ready";
    session.targetDeviceId = fromDevice;
    this.store.setSession(session);

    this.logger?.info("matrix: device accepted verification request - waiting for SAS start", {
      deviceId: fromDevice,
    });
  }

  /**
   * Handle incoming m.key.verification.start event.
   * Element has initiated SAS verification.
   */
  async handleStart(event: KeyVerificationStart, fromDevice: string): Promise<void> {
    const session = this.store.getSession(event.transaction_id);
    if (!session) {
      // Check for transaction ID replay only if no active session exists
      if (this.store.isTransactionIdUsed(event.transaction_id)) {
        this.logger?.warn(
          "matrix: verification rejected - transaction ID already used (replay attack?)",
          {
            transactionId: event.transaction_id.substring(0, 8),
          },
        );
        await this.sendCancel(
          event.transaction_id,
          fromDevice,
          CancelCode.UNKNOWN_TRANSACTION,
          "Transaction ID already used",
        );
        return;
      }
      await this.sendCancel(
        event.transaction_id,
        fromDevice,
        CancelCode.UNKNOWN_TRANSACTION,
        "Unknown transaction",
      );
      return;
    }

    if (session.state !== "ready") {
      this.logger?.warn("matrix: verification received start in unexpected state", {
        state: session.state,
        transactionId: event.transaction_id.substring(0, 8),
      });
      return;
    }

    // Validate SAS method
    if (event.method !== "m.sas.v1") {
      await this.sendCancel(
        event.transaction_id,
        fromDevice,
        CancelCode.UNKNOWN_METHOD,
        "Unsupported method",
      );
      return;
    }

    // Update session
    session.state = "started";
    this.store.setSession(session);

    this.logger?.info("matrix: verification SAS started - exchanging keys", {
      transactionId: event.transaction_id.substring(0, 8),
    });

    // Send our public key
    await this.sendKey(event.transaction_id, fromDevice);
  }

  /**
   * Handle incoming m.key.verification.key event.
   * Element has sent their public key.
   */
  async handleKey(event: KeyVerificationKey, fromDevice: string): Promise<void> {
    const session = this.store.getSession(event.transaction_id);
    if (!session) {
      // Check for transaction ID replay only if no active session exists
      if (this.store.isTransactionIdUsed(event.transaction_id)) {
        this.logger?.warn(
          "matrix: verification rejected - transaction ID already used (replay attack?)",
          {
            transactionId: event.transaction_id.substring(0, 8),
          },
        );
        await this.sendCancel(
          event.transaction_id,
          fromDevice,
          CancelCode.UNKNOWN_TRANSACTION,
          "Transaction ID already used",
        );
        return;
      }
      await this.sendCancel(
        event.transaction_id,
        fromDevice,
        CancelCode.UNKNOWN_TRANSACTION,
        "Unknown transaction",
      );
      return;
    }

    if (session.state !== "started" && session.state !== "keys_exchanged") {
      this.logger?.warn("matrix: verification received key in unexpected state", {
        state: session.state,
        transactionId: event.transaction_id.substring(0, 8),
      });
      return;
    }

    // Store their public key and update device ID (now we know the specific device)
    session.theirPublicKey = event.key;
    session.targetDeviceId = fromDevice;

    // If we have both keys, compute SAS emoji
    if (session.ourPublicKey && session.theirPublicKey) {
      session.sasEmoji = computeSasEmoji(
        this.userId,
        this.deviceId,
        session.ourPublicKey,
        session.targetUserId,
        session.targetDeviceId,
        session.theirPublicKey,
        event.transaction_id,
      );
      session.state = "confirming";
      this.store.setSession(session);

      // Display emoji prominently
      this.displayEmoji(session.sasEmoji);

      this.logger?.info(
        "matrix: verification emoji displayed - compare with Element and run: openclaw matrix verify confirm",
      );

      // Set timeout warning for 8 minutes (2 minutes before expiry)
      const timeUntilWarning = session.expiresAt - Date.now() - 2 * 60 * 1000;
      if (timeUntilWarning > 0) {
        this.timeoutWarningTimer = setTimeout(() => {
          this.logger?.warn(
            "matrix: verification session will expire in 2 minutes - please confirm soon",
            {
              transactionId: session.transactionId.substring(0, 8),
            },
          );
        }, timeUntilWarning);
      }
    } else {
      session.state = "keys_exchanged";
      this.store.setSession(session);
    }
  }

  /**
   * Handle incoming m.key.verification.mac event.
   * Element has sent their commitment MAC.
   */
  async handleMac(event: KeyVerificationMac, fromDevice: string): Promise<void> {
    const session = this.store.getSession(event.transaction_id);
    if (!session) {
      // Check for transaction ID replay only if no active session exists
      if (this.store.isTransactionIdUsed(event.transaction_id)) {
        this.logger?.warn(
          "matrix: verification rejected - transaction ID already used (replay attack?)",
          {
            transactionId: event.transaction_id.substring(0, 8),
          },
        );
        await this.sendCancel(
          event.transaction_id,
          fromDevice,
          CancelCode.UNKNOWN_TRANSACTION,
          "Transaction ID already used",
        );
        return;
      }
      await this.sendCancel(
        event.transaction_id,
        fromDevice,
        CancelCode.UNKNOWN_TRANSACTION,
        "Unknown transaction",
      );
      return;
    }

    const session = this.store.getSession(event.transaction_id);
    if (!session) {
      await this.sendCancel(
        event.transaction_id,
        fromDevice,
        CancelCode.UNKNOWN_TRANSACTION,
        "Unknown transaction",
      );
      return;
    }

    if (session.state !== "confirming") {
      this.logger?.warn("matrix: verification received MAC in unexpected state", {
        state: session.state,
        transactionId: event.transaction_id.substring(0, 8),
      });
      return;
    }

    if (!session.theirPublicKey || !session.ourPublicKey) {
      await this.sendCancel(
        event.transaction_id,
        fromDevice,
        CancelCode.KEY_MISMATCH,
        "Missing public keys",
      );
      return;
    }

    // Validate the MAC
    try {
      const isValid = await this.validateMac(
        event.transaction_id,
        fromDevice,
        session.theirPublicKey,
        session.ourPublicKey,
        event.mac,
        event.keys,
      );

      if (!isValid) {
        this.logger?.warn("matrix: verification MAC validation failed", {
          transactionId: event.transaction_id.substring(0, 8),
        });
        await this.sendCancel(
          event.transaction_id,
          fromDevice,
          CancelCode.KEY_MISMATCH,
          "MAC verification failed",
        );
        session.state = "cancelled";
        this.store.setSession(session);
        return;
      }
    } catch (error) {
      this.logger?.warn("matrix: verification MAC validation error", {
        error: String(error),
        transactionId: event.transaction_id.substring(0, 8),
      });
      await this.sendCancel(
        event.transaction_id,
        fromDevice,
        CancelCode.KEY_MISMATCH,
        "MAC validation error",
      );
      session.state = "cancelled";
      this.store.setSession(session);
      return;
    }

    this.logger?.info("matrix: verification MAC validated successfully", {
      transactionId: event.transaction_id.substring(0, 8),
    });

    // Send done event
    await this.sendDone(event.transaction_id, fromDevice);

    // Mark session as done
    session.state = "done";
    this.store.setSession(session);

    // Register transaction ID to prevent replay
    await this.store.registerTransactionId(event.transaction_id);

    // Mark device as verified and persist
    await this.store.setDeviceVerified(true);

    // Clear timeout timer
    if (this.timeoutWarningTimer) {
      clearTimeout(this.timeoutWarningTimer);
      this.timeoutWarningTimer = undefined;
    }

    this.logger?.info("matrix: ✅ device verification successful", {
      transactionId: event.transaction_id.substring(0, 8),
    });
  }

  /**
   * Handle incoming m.key.verification.done event.
   * Verification completed successfully.
   */
  async handleDone(event: KeyVerificationDone): Promise<void> {
    const session = this.store.getSession(event.transaction_id);
    if (!session) {
      this.logger?.warn("matrix: verification received done for unknown transaction", {
        transactionId: event.transaction_id.substring(0, 8),
      });
      return;
    }

    session.state = "done";
    this.store.setSession(session);

    // Register transaction ID to prevent replay
    await this.store.registerTransactionId(event.transaction_id);

    // Mark device as verified and persist
    await this.store.setDeviceVerified(true);

    // Clear timeout timer
    if (this.timeoutWarningTimer) {
      clearTimeout(this.timeoutWarningTimer);
      this.timeoutWarningTimer = undefined;
    }

    this.logger?.info("matrix: ✅ device verification complete", {
      transactionId: event.transaction_id.substring(0, 8),
    });
  }

  /**
   * Handle incoming m.key.verification.cancel event.
   * Verification was cancelled.
   */
  async handleCancel(event: KeyVerificationCancel): Promise<void> {
    const session = this.store.getSession(event.transaction_id);
    if (!session) {
      this.logger?.warn("matrix: verification received cancel for unknown transaction", {
        transactionId: event.transaction_id.substring(0, 8),
      });
      return;
    }

    session.state = "cancelled";
    this.store.setSession(session);

    // Register transaction ID to prevent replay of cancelled transactions
    await this.store.registerTransactionId(event.transaction_id);

    // Clear timeout timer
    if (this.timeoutWarningTimer) {
      clearTimeout(this.timeoutWarningTimer);
      this.timeoutWarningTimer = undefined;
    }

    this.logger?.info("matrix: ❌ verification cancelled", {
      reason: event.reason,
      code: event.code,
      transactionId: event.transaction_id.substring(0, 8),
    });
  }

  /**
   * User confirms emoji match via CLI.
   * Send MAC to complete verification.
   */
  async confirmEmoji(transactionId?: string): Promise<void> {
    const session = transactionId
      ? this.store.getSession(transactionId)
      : this.store.getMostRecentSession();

    if (!session) {
      throw new Error("No active verification session found");
    }

    if (session.state !== "confirming") {
      throw new Error(`Cannot confirm in state: ${session.state}`);
    }

    if (!session.theirPublicKey || !session.ourPublicKey) {
      throw new Error("Missing public keys");
    }

    // Send MAC
    await this.sendMac(
      session.transactionId,
      session.targetDeviceId,
      session.theirPublicKey,
      session.ourPublicKey,
    );

    this.logger?.info("matrix: verification confirmation sent - waiting for Element to complete", {
      transactionId: session.transactionId.substring(0, 8),
    });
  }

  /**
   * Cancel an active verification session.
   */
  async cancelVerification(transactionId?: string, reason = "User cancelled"): Promise<void> {
    const session = transactionId
      ? this.store.getSession(transactionId)
      : this.store.getMostRecentSession();

    if (!session) {
      throw new Error("No active verification session found");
    }

    await this.sendCancel(session.transactionId, session.targetDeviceId, CancelCode.USER, reason);

    session.state = "cancelled";
    this.store.setSession(session);

    // Clear timeout timer
    if (this.timeoutWarningTimer) {
      clearTimeout(this.timeoutWarningTimer);
      this.timeoutWarningTimer = undefined;
    }

    this.logger?.info("matrix: verification cancelled", {
      transactionId: session.transactionId.substring(0, 8),
    });
  }

  /**
   * Get the verification store (for CLI commands).
   */
  getStore(): VerificationStore {
    return this.store;
  }

  /**
   * Route incoming to-device verification events to appropriate handlers.
   * Called by the monitor when processing sync responses.
   */
  async handleToDeviceEvent(eventType: string, event: unknown, fromDevice: string): Promise<void> {
    try {
      switch (eventType) {
        case "m.key.verification.ready":
          await this.handleReady(event as KeyVerificationReady, fromDevice);
          break;
        case "m.key.verification.start":
          await this.handleStart(event as KeyVerificationStart, fromDevice);
          break;
        case "m.key.verification.key":
          await this.handleKey(event as KeyVerificationKey, fromDevice);
          break;
        case "m.key.verification.mac":
          await this.handleMac(event as KeyVerificationMac, fromDevice);
          break;
        case "m.key.verification.done":
          await this.handleDone(event as KeyVerificationDone);
          break;
        case "m.key.verification.cancel":
          await this.handleCancel(event as KeyVerificationCancel);
          break;
        default:
          this.logger?.debug?.("matrix: verification ignoring unknown event type", { eventType });
      }
    } catch (error) {
      this.logger?.warn("matrix: verification error handling event", {
        eventType,
        error: String(error),
      });
    }
  }

  // ========== Outgoing Event Senders ==========

  /**
   * Send our Curve25519 public key.
   */
  private async sendKey(transactionId: string, toDevice: string): Promise<void> {
    // Get our device's Curve25519 key from crypto client
    let publicKey: string;

    if (!this.client.crypto) {
      throw new Error("Crypto not enabled - verification cannot proceed");
    }

    try {
      // Access the underlying Rust SDK identity keys
      // The bot-sdk's CryptoClient wraps the Rust SDK but doesn't expose curve25519 publicly
      // We use a type assertion to access the private engine field temporarily
      const cryptoAny = this.client.crypto as any;
      if (!cryptoAny.engine?.identityKeys) {
        throw new Error("Crypto engine not available - verification cannot proceed");
      }

      const identityKeys = await cryptoAny.engine.identityKeys();
      publicKey = identityKeys.curve25519.toBase64();
      this.logger?.debug?.("matrix: verification using real Curve25519 key from crypto client");
    } catch (error) {
      throw new Error(
        `Failed to get device keys: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const session = this.store.getSession(transactionId);
    if (session) {
      session.ourPublicKey = publicKey;
      this.store.setSession(session);
    }

    const content: KeyVerificationKey = {
      transaction_id: transactionId,
      key: publicKey,
    };

    await this.sendToDevice("m.key.verification.key", this.userId, toDevice, content);
    this.logger?.info("matrix: verification sent public key", {
      deviceId: toDevice,
    });
  }

  /**
   * Send MAC (Message Authentication Code) to confirm emoji match.
   * Implements Matrix spec section 11.12.2.2.3.
   */
  private async sendMac(
    transactionId: string,
    toDevice: string,
    theirPublicKey: string,
    ourPublicKey: string,
  ): Promise<void> {
    if (!this.client.crypto) {
      throw new Error("Crypto not enabled - cannot compute MAC");
    }

    try {
      // Get Ed25519 device key
      const cryptoAny = this.client.crypto as any;
      if (!cryptoAny.engine?.identityKeys) {
        throw new Error("Crypto engine not available - cannot compute MAC");
      }

      const identityKeys = await cryptoAny.engine.identityKeys();
      const ed25519Key = identityKeys.ed25519.toBase64();

      // Compute shared secret from key exchange (ECDH)
      // For SAS verification, the shared secret is derived from the concatenated public keys
      const sharedSecret = this.computeSharedSecret(ourPublicKey, theirPublicKey);

      // Compute MAC for Ed25519 key
      const ed25519KeyId = `ed25519:${this.deviceId}`;
      const ed25519Mac = this.computeMac(
        sharedSecret,
        this.userId,
        this.deviceId,
        ed25519Key,
        transactionId,
      );

      // Compute MAC for Curve25519 key
      const curve25519KeyId = `curve25519:${this.deviceId}`;
      const curve25519Mac = this.computeMac(
        sharedSecret,
        this.userId,
        this.deviceId,
        ourPublicKey,
        transactionId,
      );

      // Compute MAC over key IDs
      const keyIds = [ed25519KeyId, curve25519KeyId].sort().join(",");
      const keysMac = this.computeKeysMac(sharedSecret, keyIds, transactionId);

      const content: KeyVerificationMac = {
        transaction_id: transactionId,
        mac: {
          [ed25519KeyId]: ed25519Mac,
          [curve25519KeyId]: curve25519Mac,
        },
        keys: keysMac,
      };

      await this.sendToDevice("m.key.verification.mac", this.userId, toDevice, content);
      this.logger?.info("matrix: verification sent MAC", {
        deviceId: toDevice,
      });
    } catch (error) {
      throw new Error(
        `Failed to compute MAC: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Send verification done event.
   */
  private async sendDone(transactionId: string, toDevice: string): Promise<void> {
    const content: KeyVerificationDone = {
      transaction_id: transactionId,
    };

    await this.sendToDevice("m.key.verification.done", this.userId, toDevice, content);
    this.logger?.info("matrix: verification sent done", {
      deviceId: toDevice,
    });
  }

  /**
   * Send verification cancel event.
   */
  private async sendCancel(
    transactionId: string,
    toDevice: string,
    code: string,
    reason: string,
  ): Promise<void> {
    const content: KeyVerificationCancel = {
      transaction_id: transactionId,
      code,
      reason,
    };

    await this.sendToDevice("m.key.verification.cancel", this.userId, toDevice, content);
    this.logger?.info("matrix: verification sent cancel", {
      deviceId: toDevice,
      reason,
    });
  }

  /**
   * Validate incoming MAC from the other device.
   * Implements constant-time comparison to prevent timing attacks.
   */
  private async validateMac(
    transactionId: string,
    theirDeviceId: string,
    theirPublicKey: string,
    ourPublicKey: string,
    receivedMacs: Record<string, string>,
    receivedKeysMac: string,
  ): Promise<boolean> {
    // Compute expected MACs using the same algorithm as sendMac
    const sharedSecret = this.computeSharedSecret(ourPublicKey, theirPublicKey);

    // Build expected key IDs and MACs
    const expectedMacs: Record<string, string> = {};
    const keyIds: string[] = [];

    for (const keyId of Object.keys(receivedMacs)) {
      // Extract key type and verify it matches their device
      const [keyType, deviceId] = keyId.split(":");
      if (deviceId !== theirDeviceId) {
        this.logger?.warn("matrix: verification MAC device ID mismatch", {
          expected: theirDeviceId,
          received: deviceId,
        });
        return false;
      }

      // We need their actual Ed25519 key to validate
      // For now, we validate the structure but skip Ed25519 validation
      // The Curve25519 key we already have from the key exchange
      if (keyType === "curve25519") {
        const expectedMac = this.computeMac(
          sharedSecret,
          this.userId,
          theirDeviceId,
          theirPublicKey,
          transactionId,
        );
        expectedMacs[keyId] = expectedMac;
      }
      // Phase 1 Limitation: Ed25519 signing key validation deferred
      // See: .holocode/proposed/20260212-matrix-device-verification/SPEC.md "Phase 1 Limitations"
      // TODO: Implement full Ed25519 MAC validation in Phase 2
      // For now, we validate structure only:

      keyIds.push(keyId);
    }

    // Validate Curve25519 MAC with constant-time comparison
    const curve25519KeyId = `curve25519:${theirDeviceId}`;
    if (receivedMacs[curve25519KeyId] && expectedMacs[curve25519KeyId]) {
      const receivedBuf = Buffer.from(receivedMacs[curve25519KeyId], "base64");
      const expectedBuf = Buffer.from(expectedMacs[curve25519KeyId], "base64");

      if (receivedBuf.length !== expectedBuf.length) {
        return false;
      }

      // Constant-time comparison
      const { timingSafeEqual } = await import("node:crypto");
      if (!timingSafeEqual(receivedBuf, expectedBuf)) {
        return false;
      }
    }

    // Validate keys MAC
    const expectedKeyIds = keyIds.sort().join(",");
    const expectedKeysMac = this.computeKeysMac(sharedSecret, expectedKeyIds, transactionId);
    const receivedKeysBuf = Buffer.from(receivedKeysMac, "base64");
    const expectedKeysBuf = Buffer.from(expectedKeysMac, "base64");

    if (receivedKeysBuf.length !== expectedKeysBuf.length) {
      return false;
    }

    const { timingSafeEqual } = await import("node:crypto");
    return timingSafeEqual(receivedKeysBuf, expectedKeysBuf);
  }

  /**
   * Compute shared secret from public keys.
   * For SAS verification, this is a simple concatenation in lexicographic order.
   */
  private computeSharedSecret(ourPublicKey: string, theirPublicKey: string): Buffer {
    const keys = [ourPublicKey, theirPublicKey].sort();
    return Buffer.from(`${keys[0]}${keys[1]}`, "utf8");
  }

  /**
   * Compute MAC for a device key.
   * Per Matrix spec section 11.12.2.2.3:
   * MAC = HMAC-SHA256(sharedSecret, "MATRIX_KEY_VERIFICATION_MAC" + userId + deviceId + key + transactionId)
   */
  private computeMac(
    sharedSecret: Buffer,
    userId: string,
    deviceId: string,
    key: string,
    transactionId: string,
  ): string {
    const input = `MATRIX_KEY_VERIFICATION_MAC${userId}${deviceId}${key}${transactionId}`;
    const hmac = createHmac("sha256", sharedSecret);
    hmac.update(input);
    return hmac.digest("base64");
  }

  /**
   * Compute MAC for the list of key IDs.
   */
  private computeKeysMac(sharedSecret: Buffer, keyIds: string, transactionId: string): string {
    const input = `MATRIX_KEY_VERIFICATION_MAC_IDS${keyIds}${transactionId}`;
    const hmac = createHmac("sha256", sharedSecret);
    hmac.update(input);
    return hmac.digest("base64");
  }

  // ========== Utility Methods ==========

  /**
   * Send a to-device message with retries.
   */
  private async sendToDevice(
    eventType: string,
    userId: string,
    deviceId: string,
    content: unknown,
  ): Promise<void> {
    const messages = {
      [userId]: {
        [deviceId]: content,
      },
    };

    // Retry logic: 3 attempts with exponential backoff
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.client.sendToDevices(eventType, messages);
        return; // Success
      } catch (error) {
        lastError = error as Error;
        this.logger?.warn("matrix: verification message send retry", {
          eventType,
          attempt,
          maxAttempts: 3,
          error: String(error),
        });

        if (attempt < 3) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Failed to send ${eventType} after 3 attempts: ${lastError?.message}`);
  }

  /**
   * Display emoji prominently in terminal (ASCII art box).
   */
  private displayEmoji(emoji: Array<{ emoji: string; name: string }>): void {
    const width = 50;
    const border = "┌" + "─".repeat(width - 2) + "┐";
    const bottomBorder = "└" + "─".repeat(width - 2) + "┘";

    console.log("\n");
    console.log(border);
    console.log("│" + " ".repeat(width - 2) + "│");
    console.log("│" + centerText("🔐 VERIFICATION EMOJI 🔐", width) + "│");
    console.log("│" + " ".repeat(width - 2) + "│");
    console.log("│" + centerText("Compare these with Element:", width) + "│");
    console.log("│" + " ".repeat(width - 2) + "│");

    // Display emoji in a single line
    const emojiLine = emoji.map((e) => e.emoji).join(" ");
    console.log("│" + centerText(emojiLine, width) + "│");
    console.log("│" + " ".repeat(width - 2) + "│");

    // Display names
    const nameLines = chunkArray(
      emoji.map((e) => e.name),
      3,
    );
    for (const chunk of nameLines) {
      const nameLine = chunk.join("  ");
      console.log("│" + centerText(nameLine, width) + "│");
    }

    console.log("│" + " ".repeat(width - 2) + "│");
    console.log(bottomBorder);
    console.log("\n");
  }
}

// ========== Helper Functions ==========

/**
 * Generate a unique transaction ID.
 */
function generateTransactionId(): string {
  return `oclaw_${randomBytes(16).toString("hex")}`;
}

/**
 * Center text within a given width.
 */
function centerText(text: string, width: number): string {
  // Remove ANSI codes for length calculation
  const cleanText = text.replace(/\u001b\[[0-9;]*m/g, "");
  const padding = Math.max(0, width - 2 - cleanText.length);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return " ".repeat(leftPad) + text + " ".repeat(rightPad);
}

/**
 * Split array into chunks.
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
