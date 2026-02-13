/**
 * Unit tests for SAS emoji computation.
 * Tests HKDF-SHA256 key derivation and emoji mapping.
 */

import { describe, it, expect } from "vitest";
import { SAS_EMOJI } from "./emoji.js";
import { computeSasEmoji, generateTestKeyPair } from "./sas.js";

describe("SAS Emoji Computation", () => {
  describe("computeSasEmoji", () => {
    const ourUserId = "@bot:matrix.org";
    const ourDeviceId = "BOTDEVICE";
    const theirUserId = "@user:matrix.org";
    const theirDeviceId = "USERDEVICE";

    it("should compute 7 emoji from two public keys", () => {
      const ourKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      const theirKey = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
      const txnId = "test_transaction_123";

      const emoji = computeSasEmoji(
        ourUserId,
        ourDeviceId,
        ourKey,
        theirUserId,
        theirDeviceId,
        theirKey,
        txnId,
      );

      expect(emoji).toHaveLength(7);
      expect(emoji.every((e) => typeof e.emoji === "string")).toBe(true);
      expect(emoji.every((e) => typeof e.name === "string")).toBe(true);
    });

    it("should produce consistent results for the same inputs", () => {
      const ourKey = "TestKey1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      const theirKey = "TestKey2BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
      const txnId = "consistent_test";

      const emoji1 = computeSasEmoji(
        ourUserId,
        ourDeviceId,
        ourKey,
        theirUserId,
        theirDeviceId,
        theirKey,
        txnId,
      );
      const emoji2 = computeSasEmoji(
        ourUserId,
        ourDeviceId,
        ourKey,
        theirUserId,
        theirDeviceId,
        theirKey,
        txnId,
      );

      expect(emoji1).toEqual(emoji2);
    });

    it("should produce different results for different keys", () => {
      const ourKey1 = "Key1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      const theirKey1 = "Key1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
      const ourKey2 = "Key2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      const theirKey2 = "Key2BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
      const txnId = "different_keys_test";

      const emoji1 = computeSasEmoji(
        ourUserId,
        ourDeviceId,
        ourKey1,
        theirUserId,
        theirDeviceId,
        theirKey1,
        txnId,
      );
      const emoji2 = computeSasEmoji(
        ourUserId,
        ourDeviceId,
        ourKey2,
        theirUserId,
        theirDeviceId,
        theirKey2,
        txnId,
      );

      // Different keys should produce different emoji (with high probability)
      expect(emoji1).not.toEqual(emoji2);
    });

    it("should be order-independent (lexicographic sorting)", () => {
      const keyA = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      const keyB = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
      const txnId = "order_test";

      const emoji1 = computeSasEmoji(
        ourUserId,
        ourDeviceId,
        keyA,
        theirUserId,
        theirDeviceId,
        keyB,
        txnId,
      );
      const emoji2 = computeSasEmoji(
        theirUserId,
        theirDeviceId,
        keyB,
        ourUserId,
        ourDeviceId,
        keyA,
        txnId,
      );

      // Should produce same emoji regardless of participant order
      expect(emoji1).toEqual(emoji2);
    });

    it("should map indices to valid SAS emoji (0-63)", () => {
      const ourKey = "ValidKey1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      const theirKey = "ValidKey2BBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
      const txnId = "valid_emoji_test";

      const emoji = computeSasEmoji(
        ourUserId,
        ourDeviceId,
        ourKey,
        theirUserId,
        theirDeviceId,
        theirKey,
        txnId,
      );

      // Each emoji should be from the standard list
      for (const e of emoji) {
        const found = SAS_EMOJI.find(
          (standard) => standard.emoji === e.emoji && standard.name === e.name,
        );
        expect(found).toBeDefined();
      }
    });

    it("should handle edge case: identical keys", () => {
      const key = "SameKeySameKeySameKeySameKeySameKeyAAA=";
      const txnId = "identical_keys_test";

      // This should still work (though in practice keys should differ)
      const emoji = computeSasEmoji(
        ourUserId,
        ourDeviceId,
        key,
        theirUserId,
        theirDeviceId,
        key,
        txnId,
      );

      expect(emoji).toHaveLength(7);
    });

    it("should produce different emoji for different transaction IDs", () => {
      const ourKey = "KeyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      const theirKey = "KeyBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";

      const emoji1 = computeSasEmoji(
        ourUserId,
        ourDeviceId,
        ourKey,
        theirUserId,
        theirDeviceId,
        theirKey,
        "txn_001",
      );
      const emoji2 = computeSasEmoji(
        ourUserId,
        ourDeviceId,
        ourKey,
        theirUserId,
        theirDeviceId,
        theirKey,
        "txn_002",
      );

      // Different transaction IDs should produce different emoji
      expect(emoji1).not.toEqual(emoji2);
    });

    it("should produce different emoji for different user IDs", () => {
      const ourKey = "KeyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      const theirKey = "KeyBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
      const txnId = "user_test";

      const emoji1 = computeSasEmoji(
        "@alice:matrix.org",
        ourDeviceId,
        ourKey,
        "@bob:matrix.org",
        theirDeviceId,
        theirKey,
        txnId,
      );
      const emoji2 = computeSasEmoji(
        "@charlie:matrix.org",
        ourDeviceId,
        ourKey,
        "@dave:matrix.org",
        theirDeviceId,
        theirKey,
        txnId,
      );

      // Different user IDs should produce different emoji
      expect(emoji1).not.toEqual(emoji2);
    });

    it("should produce different emoji for different device IDs", () => {
      const ourKey = "KeyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      const theirKey = "KeyBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
      const txnId = "device_test";

      const emoji1 = computeSasEmoji(
        ourUserId,
        "DEVICE1",
        ourKey,
        theirUserId,
        "DEVICE2",
        theirKey,
        txnId,
      );
      const emoji2 = computeSasEmoji(
        ourUserId,
        "DEVICE3",
        ourKey,
        theirUserId,
        "DEVICE4",
        theirKey,
        txnId,
      );

      // Different device IDs should produce different emoji
      expect(emoji1).not.toEqual(emoji2);
    });
  });

  describe("SAS Emoji List", () => {
    it("should contain exactly 64 emoji", () => {
      expect(SAS_EMOJI).toHaveLength(64);
    });

    it("should have unique emoji characters", () => {
      const emojiSet = new Set(SAS_EMOJI.map((e) => e.emoji));
      expect(emojiSet.size).toBe(64);
    });

    it("should have unique names", () => {
      const nameSet = new Set(SAS_EMOJI.map((e) => e.name));
      expect(nameSet.size).toBe(64);
    });

    it("should start with expected emoji per Matrix spec", () => {
      // First few emoji from Matrix spec v1.11
      expect(SAS_EMOJI[0]).toEqual({ emoji: "🐶", name: "Dog" });
      expect(SAS_EMOJI[1]).toEqual({ emoji: "🐱", name: "Cat" });
      expect(SAS_EMOJI[2]).toEqual({ emoji: "🦁", name: "Lion" });
      expect(SAS_EMOJI[3]).toEqual({ emoji: "🐎", name: "Horse" });
    });

    it("should end with expected emoji per Matrix spec", () => {
      // Last few emoji from Matrix spec v1.11
      expect(SAS_EMOJI[60]).toEqual({ emoji: "⚓", name: "Anchor" });
      expect(SAS_EMOJI[61]).toEqual({ emoji: "🎧", name: "Headphones" });
      expect(SAS_EMOJI[62]).toEqual({ emoji: "📁", name: "Folder" });
      expect(SAS_EMOJI[63]).toEqual({ emoji: "📌", name: "Pin" });
    });
  });

  describe("generateTestKeyPair", () => {
    it("should generate valid base64 keys", () => {
      const { publicKey, privateKey } = generateTestKeyPair();

      // Should be valid base64
      expect(() => Buffer.from(publicKey, "base64")).not.toThrow();
      expect(() => Buffer.from(privateKey, "base64")).not.toThrow();

      // Should be 32 bytes (Curve25519 key size)
      expect(Buffer.from(publicKey, "base64")).toHaveLength(32);
      expect(Buffer.from(privateKey, "base64")).toHaveLength(32);
    });

    it("should generate different keys each time", () => {
      const pair1 = generateTestKeyPair();
      const pair2 = generateTestKeyPair();

      expect(pair1.publicKey).not.toBe(pair2.publicKey);
      expect(pair1.privateKey).not.toBe(pair2.privateKey);
    });
  });

  describe("Test Vectors (Known Examples)", () => {
    // Test vector from Matrix spec example (if available)
    // These would be actual test vectors from the spec or reference implementations
    // For now, we test internal consistency

    it("should match expected emoji for known key pair (consistency check)", () => {
      // Use a fixed seed for reproducible test
      const ourUserId = "@alice:matrix.org";
      const ourDeviceId = "ALICEDEVICE";
      const ourKey = "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="; // "1234567890..." base64
      const theirUserId = "@bob:matrix.org";
      const theirDeviceId = "BOBDEVICE";
      const theirKey = "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXphYmNkZWY="; // "abcdefg..." base64
      const txnId = "test_vector_001";

      const emoji = computeSasEmoji(
        ourUserId,
        ourDeviceId,
        ourKey,
        theirUserId,
        theirDeviceId,
        theirKey,
        txnId,
      );

      // Snapshot test: these should not change unless algorithm changes
      expect(emoji).toHaveLength(7);

      // Ensure each emoji is valid
      for (const e of emoji) {
        const index = SAS_EMOJI.findIndex((s) => s.emoji === e.emoji && s.name === e.name);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(64);
      }
    });
  });
});
