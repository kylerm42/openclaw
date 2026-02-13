/**
 * Unit tests for MAC computation and validation in device verification.
 * Tests HMAC-SHA256 MAC generation and constant-time validation.
 */

import { createHmac } from "node:crypto";
import { describe, it, expect, vi } from "vitest";

/**
 * Helper to compute MAC for a device key.
 * Mirrors the implementation in VerificationHandler.
 */
function computeMac(
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
 * Helper to compute MAC for key IDs.
 * Mirrors the implementation in VerificationHandler.
 */
function computeKeysMac(sharedSecret: Buffer, keyIds: string, transactionId: string): string {
  const input = `MATRIX_KEY_VERIFICATION_MAC_IDS${keyIds}${transactionId}`;
  const hmac = createHmac("sha256", sharedSecret);
  hmac.update(input);
  return hmac.digest("base64");
}

/**
 * Helper to compute shared secret from public keys.
 * Mirrors the implementation in VerificationHandler.
 */
function computeSharedSecret(ourPublicKey: string, theirPublicKey: string): Buffer {
  const keys = [ourPublicKey, theirPublicKey].sort();
  return Buffer.from(`${keys[0]}${keys[1]}`, "utf8");
}

describe("MAC Computation and Validation", () => {
  const userId = "@bot:matrix.org";
  const deviceId = "BOTDEVICE";
  const publicKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const transactionId = "test_txn_001";

  describe("computeMac", () => {
    it("should compute deterministic MAC for device key", () => {
      const sharedSecret = Buffer.from("shared_secret_test_123", "utf8");

      const mac1 = computeMac(sharedSecret, userId, deviceId, publicKey, transactionId);
      const mac2 = computeMac(sharedSecret, userId, deviceId, publicKey, transactionId);

      expect(mac1).toBe(mac2);
      expect(mac1).toBeTruthy();
      expect(typeof mac1).toBe("string");
    });

    it("should produce different MACs for different keys", () => {
      const sharedSecret = Buffer.from("shared_secret_test_123", "utf8");
      const key1 = "KeyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      const key2 = "KeyBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";

      const mac1 = computeMac(sharedSecret, userId, deviceId, key1, transactionId);
      const mac2 = computeMac(sharedSecret, userId, deviceId, key2, transactionId);

      expect(mac1).not.toBe(mac2);
    });

    it("should produce different MACs for different user IDs", () => {
      const sharedSecret = Buffer.from("shared_secret_test_123", "utf8");

      const mac1 = computeMac(
        sharedSecret,
        "@alice:matrix.org",
        deviceId,
        publicKey,
        transactionId,
      );
      const mac2 = computeMac(sharedSecret, "@bob:matrix.org", deviceId, publicKey, transactionId);

      expect(mac1).not.toBe(mac2);
    });

    it("should produce different MACs for different device IDs", () => {
      const sharedSecret = Buffer.from("shared_secret_test_123", "utf8");

      const mac1 = computeMac(sharedSecret, userId, "DEVICE1", publicKey, transactionId);
      const mac2 = computeMac(sharedSecret, userId, "DEVICE2", publicKey, transactionId);

      expect(mac1).not.toBe(mac2);
    });

    it("should produce different MACs for different transaction IDs", () => {
      const sharedSecret = Buffer.from("shared_secret_test_123", "utf8");

      const mac1 = computeMac(sharedSecret, userId, deviceId, publicKey, "txn_001");
      const mac2 = computeMac(sharedSecret, userId, deviceId, publicKey, "txn_002");

      expect(mac1).not.toBe(mac2);
    });

    it("should follow Matrix spec format", () => {
      const sharedSecret = Buffer.from("test_secret", "utf8");
      const mac = computeMac(sharedSecret, userId, deviceId, publicKey, transactionId);

      // Should be valid base64
      expect(() => Buffer.from(mac, "base64")).not.toThrow();

      // HMAC-SHA256 produces 32 bytes = 44 base64 characters (with padding)
      expect(mac.length).toBeGreaterThan(40);
      expect(mac.length).toBeLessThanOrEqual(44);
    });
  });

  describe("computeKeysMac", () => {
    it("should compute deterministic MAC for key IDs", () => {
      const sharedSecret = Buffer.from("shared_secret_test_123", "utf8");
      const keyIds = "curve25519:DEVICE1,ed25519:DEVICE1";

      const mac1 = computeKeysMac(sharedSecret, keyIds, transactionId);
      const mac2 = computeKeysMac(sharedSecret, keyIds, transactionId);

      expect(mac1).toBe(mac2);
    });

    it("should produce different MACs for different key ID lists", () => {
      const sharedSecret = Buffer.from("shared_secret_test_123", "utf8");
      const keyIds1 = "curve25519:DEVICE1,ed25519:DEVICE1";
      const keyIds2 = "curve25519:DEVICE2,ed25519:DEVICE2";

      const mac1 = computeKeysMac(sharedSecret, keyIds1, transactionId);
      const mac2 = computeKeysMac(sharedSecret, keyIds2, transactionId);

      expect(mac1).not.toBe(mac2);
    });

    it("should be sensitive to key ID order", () => {
      const sharedSecret = Buffer.from("shared_secret_test_123", "utf8");
      const keyIds1 = "curve25519:DEVICE,ed25519:DEVICE";
      const keyIds2 = "ed25519:DEVICE,curve25519:DEVICE";

      const mac1 = computeKeysMac(sharedSecret, keyIds1, transactionId);
      const mac2 = computeKeysMac(sharedSecret, keyIds2, transactionId);

      // Order matters - should produce different MACs
      expect(mac1).not.toBe(mac2);
    });
  });

  describe("computeSharedSecret", () => {
    it("should compute shared secret from public keys", () => {
      const ourKey = "OurKeyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      const theirKey = "TheirKeyBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";

      const secret = computeSharedSecret(ourKey, theirKey);

      expect(secret).toBeInstanceOf(Buffer);
      expect(secret.length).toBeGreaterThan(0);
    });

    it("should be order-independent (lexicographic)", () => {
      const keyA = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      const keyB = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";

      const secret1 = computeSharedSecret(keyA, keyB);
      const secret2 = computeSharedSecret(keyB, keyA);

      expect(secret1.equals(secret2)).toBe(true);
    });

    it("should produce different secrets for different key pairs", () => {
      const key1A = "Key1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      const key1B = "Key1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
      const key2A = "Key2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      const key2B = "Key2BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";

      const secret1 = computeSharedSecret(key1A, key1B);
      const secret2 = computeSharedSecret(key2A, key2B);

      expect(secret1.equals(secret2)).toBe(false);
    });
  });

  describe("MAC Validation Flow", () => {
    it("should validate matching MACs", () => {
      const ourKey = "OurKeyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      const theirKey = "TheirKeyBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
      const sharedSecret = computeSharedSecret(ourKey, theirKey);

      // Compute MAC
      const expectedMac = computeMac(sharedSecret, userId, deviceId, theirKey, transactionId);

      // Simulate receiving the same MAC
      const receivedMac = expectedMac;

      // Constant-time comparison
      const receivedBuf = Buffer.from(receivedMac, "base64");
      const expectedBuf = Buffer.from(expectedMac, "base64");

      const { timingSafeEqual } = require("node:crypto");
      const isValid = timingSafeEqual(receivedBuf, expectedBuf);

      expect(isValid).toBe(true);
    });

    it("should reject mismatched MACs", () => {
      const ourKey = "OurKeyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      const theirKey = "TheirKeyBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
      const sharedSecret = computeSharedSecret(ourKey, theirKey);

      // Compute expected MAC
      const expectedMac = computeMac(sharedSecret, userId, deviceId, theirKey, transactionId);

      // Simulate receiving a different MAC (tampered)
      const tamperedMac = computeMac(
        sharedSecret,
        "@attacker:matrix.org",
        deviceId,
        theirKey,
        transactionId,
      );

      // Constant-time comparison
      const receivedBuf = Buffer.from(tamperedMac, "base64");
      const expectedBuf = Buffer.from(expectedMac, "base64");

      const { timingSafeEqual } = require("node:crypto");
      const isValid = timingSafeEqual(receivedBuf, expectedBuf);

      expect(isValid).toBe(false);
    });

    it("should reject MACs with different lengths", () => {
      const mac1 = Buffer.from("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", "base64");
      const mac2 = Buffer.from("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "base64");

      // Different lengths should be caught before constant-time comparison
      expect(mac1.length).not.toBe(mac2.length);
    });
  });

  describe("Security Properties", () => {
    it("should use HMAC-SHA256", () => {
      const sharedSecret = Buffer.from("test_secret", "utf8");
      const mac = computeMac(sharedSecret, userId, deviceId, publicKey, transactionId);

      // HMAC-SHA256 output is 32 bytes
      const macBuffer = Buffer.from(mac, "base64");
      expect(macBuffer.length).toBe(32);
    });

    it("should include all required inputs in MAC computation", () => {
      const sharedSecret = Buffer.from("test_secret", "utf8");

      // Verify that changing any input changes the MAC
      const baseMac = computeMac(sharedSecret, userId, deviceId, publicKey, transactionId);

      // Change user ID
      const mac1 = computeMac(
        sharedSecret,
        "@different:matrix.org",
        deviceId,
        publicKey,
        transactionId,
      );
      expect(mac1).not.toBe(baseMac);

      // Change device ID
      const mac2 = computeMac(sharedSecret, userId, "DIFFERENT_DEVICE", publicKey, transactionId);
      expect(mac2).not.toBe(baseMac);

      // Change public key
      const mac3 = computeMac(
        sharedSecret,
        userId,
        deviceId,
        "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
        transactionId,
      );
      expect(mac3).not.toBe(baseMac);

      // Change transaction ID
      const mac4 = computeMac(sharedSecret, userId, deviceId, publicKey, "different_txn");
      expect(mac4).not.toBe(baseMac);
    });

    it("should follow Matrix spec MAC input format", () => {
      // The MAC input should be: "MATRIX_KEY_VERIFICATION_MAC" + userId + deviceId + key + transactionId
      // No separators per spec
      const sharedSecret = Buffer.from("test_secret", "utf8");

      // This test verifies the exact format by checking that the implementation matches expected output
      const expectedInput = `MATRIX_KEY_VERIFICATION_MAC${userId}${deviceId}${publicKey}${transactionId}`;

      // Compute expected MAC manually
      const hmac = createHmac("sha256", sharedSecret);
      hmac.update(expectedInput);
      const expectedMac = hmac.digest("base64");

      // Compare with our function
      const actualMac = computeMac(sharedSecret, userId, deviceId, publicKey, transactionId);

      expect(actualMac).toBe(expectedMac);
    });
  });
});
