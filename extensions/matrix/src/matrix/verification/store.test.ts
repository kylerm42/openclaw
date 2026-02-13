/**
 * Unit tests for verification store.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import type { VerificationSession } from "./types.js";
import { VerificationStore } from "./store.js";

describe("VerificationStore", () => {
  let store: VerificationStore;

  beforeEach(() => {
    store = new VerificationStore();
  });

  describe("Session Management", () => {
    it("should store and retrieve a session", () => {
      const session: VerificationSession = {
        transactionId: "txn_001",
        direction: "outgoing",
        targetUserId: "@user:matrix.org",
        targetDeviceId: "DEVICE123",
        method: "m.sas.v1",
        state: "requested",
        createdAt: Date.now(),
        expiresAt: Date.now() + 600000,
      };

      store.setSession(session);
      const retrieved = store.getSession("txn_001");

      expect(retrieved).toEqual(session);
    });

    it("should return undefined for non-existent session", () => {
      const retrieved = store.getSession("nonexistent");
      expect(retrieved).toBeUndefined();
    });

    it("should update an existing session", () => {
      const session: VerificationSession = {
        transactionId: "txn_002",
        direction: "outgoing",
        targetUserId: "@user:matrix.org",
        targetDeviceId: "DEVICE123",
        method: "m.sas.v1",
        state: "requested",
        createdAt: Date.now(),
        expiresAt: Date.now() + 600000,
      };

      store.setSession(session);

      // Update state
      session.state = "ready";
      store.setSession(session);

      const retrieved = store.getSession("txn_002");
      expect(retrieved?.state).toBe("ready");
    });

    it("should remove a session", () => {
      const session: VerificationSession = {
        transactionId: "txn_003",
        direction: "outgoing",
        targetUserId: "@user:matrix.org",
        targetDeviceId: "DEVICE123",
        method: "m.sas.v1",
        state: "requested",
        createdAt: Date.now(),
        expiresAt: Date.now() + 600000,
      };

      store.setSession(session);
      store.removeSession("txn_003");

      const retrieved = store.getSession("txn_003");
      expect(retrieved).toBeUndefined();
    });

    it("should get all sessions", () => {
      const session1: VerificationSession = {
        transactionId: "txn_004",
        direction: "outgoing",
        targetUserId: "@user:matrix.org",
        targetDeviceId: "DEVICE123",
        method: "m.sas.v1",
        state: "requested",
        createdAt: Date.now(),
        expiresAt: Date.now() + 600000,
      };

      const session2: VerificationSession = {
        transactionId: "txn_005",
        direction: "outgoing",
        targetUserId: "@user:matrix.org",
        targetDeviceId: "DEVICE456",
        method: "m.sas.v1",
        state: "ready",
        createdAt: Date.now(),
        expiresAt: Date.now() + 600000,
      };

      store.setSession(session1);
      store.setSession(session2);

      const allSessions = store.getAllSessions();
      expect(allSessions).toHaveLength(2);
      expect(allSessions).toContainEqual(session1);
      expect(allSessions).toContainEqual(session2);
    });

    it("should clear all sessions", () => {
      const session1: VerificationSession = {
        transactionId: "txn_006",
        direction: "outgoing",
        targetUserId: "@user:matrix.org",
        targetDeviceId: "DEVICE123",
        method: "m.sas.v1",
        state: "requested",
        createdAt: Date.now(),
        expiresAt: Date.now() + 600000,
      };

      const session2: VerificationSession = {
        transactionId: "txn_007",
        direction: "outgoing",
        targetUserId: "@user:matrix.org",
        targetDeviceId: "DEVICE456",
        method: "m.sas.v1",
        state: "ready",
        createdAt: Date.now(),
        expiresAt: Date.now() + 600000,
      };

      store.setSession(session1);
      store.setSession(session2);

      store.clearSessions();

      const allSessions = store.getAllSessions();
      expect(allSessions).toHaveLength(0);
    });
  });

  describe("Device Verification State", () => {
    it("should start with device unverified", () => {
      expect(store.isDeviceVerified()).toBe(false);
    });

    it("should mark device as verified", () => {
      store.setDeviceVerified(true);
      expect(store.isDeviceVerified()).toBe(true);
    });

    it("should unmark device as verified", () => {
      store.setDeviceVerified(true);
      store.setDeviceVerified(false);
      expect(store.isDeviceVerified()).toBe(false);
    });
  });

  describe("Session Expiry", () => {
    it("should clean up expired sessions", () => {
      const now = Date.now();

      const expiredSession: VerificationSession = {
        transactionId: "txn_expired",
        direction: "outgoing",
        targetUserId: "@user:matrix.org",
        targetDeviceId: "DEVICE123",
        method: "m.sas.v1",
        state: "requested",
        createdAt: now - 700000, // 11+ minutes ago
        expiresAt: now - 100000, // Expired 1+ minutes ago
      };

      const activeSession: VerificationSession = {
        transactionId: "txn_active",
        direction: "outgoing",
        targetUserId: "@user:matrix.org",
        targetDeviceId: "DEVICE456",
        method: "m.sas.v1",
        state: "requested",
        createdAt: now,
        expiresAt: now + 600000, // Expires in 10 minutes
      };

      store.setSession(expiredSession);
      store.setSession(activeSession);

      const removedCount = store.cleanupExpiredSessions();

      expect(removedCount).toBe(1);
      expect(store.getSession("txn_expired")).toBeUndefined();
      expect(store.getSession("txn_active")).toBeDefined();
    });

    it("should return 0 when no expired sessions", () => {
      const now = Date.now();

      const activeSession: VerificationSession = {
        transactionId: "txn_active_only",
        direction: "outgoing",
        targetUserId: "@user:matrix.org",
        targetDeviceId: "DEVICE123",
        method: "m.sas.v1",
        state: "requested",
        createdAt: now,
        expiresAt: now + 600000,
      };

      store.setSession(activeSession);

      const removedCount = store.cleanupExpiredSessions();

      expect(removedCount).toBe(0);
      expect(store.getSession("txn_active_only")).toBeDefined();
    });
  });

  describe("Get Most Recent Session", () => {
    it("should return undefined when no sessions", () => {
      const mostRecent = store.getMostRecentSession();
      expect(mostRecent).toBeUndefined();
    });

    it("should return the most recently created session", () => {
      const now = Date.now();

      const session1: VerificationSession = {
        transactionId: "txn_older",
        direction: "outgoing",
        targetUserId: "@user:matrix.org",
        targetDeviceId: "DEVICE123",
        method: "m.sas.v1",
        state: "requested",
        createdAt: now - 10000, // 10 seconds ago
        expiresAt: now + 590000,
      };

      const session2: VerificationSession = {
        transactionId: "txn_newer",
        direction: "outgoing",
        targetUserId: "@user:matrix.org",
        targetDeviceId: "DEVICE456",
        method: "m.sas.v1",
        state: "ready",
        createdAt: now, // Just now
        expiresAt: now + 600000,
      };

      store.setSession(session1);
      store.setSession(session2);

      const mostRecent = store.getMostRecentSession();

      expect(mostRecent?.transactionId).toBe("txn_newer");
    });

    it("should return the only session if there is one", () => {
      const session: VerificationSession = {
        transactionId: "txn_only",
        direction: "outgoing",
        targetUserId: "@user:matrix.org",
        targetDeviceId: "DEVICE123",
        method: "m.sas.v1",
        state: "requested",
        createdAt: Date.now(),
        expiresAt: Date.now() + 600000,
      };

      store.setSession(session);

      const mostRecent = store.getMostRecentSession();

      expect(mostRecent).toEqual(session);
    });
  });

  describe("Transaction ID Replay Protection", () => {
    it("should track used transaction IDs", async () => {
      const store = new VerificationStore();
      const txnId = "test_txn_001";

      // Initially not used
      expect(store.isTransactionIdUsed(txnId)).toBe(false);

      // Register transaction ID
      await store.registerTransactionId(txnId);

      // Now it should be marked as used
      expect(store.isTransactionIdUsed(txnId)).toBe(true);
    });

    it("should persist and reload used transaction IDs", async () => {
      const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "verification-replay-test-"));
      const store1 = new VerificationStore();
      await store1.initialize(tmpDir);

      const txnId = "test_txn_002";
      await store1.registerTransactionId(txnId);

      // Create new store instance and reload
      const store2 = new VerificationStore();
      await store2.initialize(tmpDir);

      // Transaction ID should still be marked as used
      expect(store2.isTransactionIdUsed(txnId)).toBe(true);

      // Cleanup
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    });

    it("should not reload transaction IDs older than 24 hours", async () => {
      const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "verification-replay-old-"));
      const store1 = new VerificationStore();
      await store1.initialize(tmpDir);

      const txnId = "old_txn_003";

      // Manually create an old transaction ID in the persisted state
      const statePath = path.join(tmpDir, "verification-state.json");
      const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      const state = {
        deviceVerified: false,
        usedTransactionIds: [{ id: txnId, timestamp: oldTimestamp }],
      };
      await fs.promises.writeFile(statePath, JSON.stringify(state, null, 2));

      // Create new store and reload
      const store2 = new VerificationStore();
      await store2.initialize(tmpDir);

      // Old transaction ID should not be loaded
      expect(store2.isTransactionIdUsed(txnId)).toBe(false);

      // Cleanup
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    });

    it("should cleanup old transaction IDs when saving", async () => {
      const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "verification-cleanup-"));
      const store = new VerificationStore();
      await store.initialize(tmpDir);

      // Register a transaction ID
      const recentTxnId = "recent_txn_004";
      await store.registerTransactionId(recentTxnId);

      // Manually inject an old transaction ID (simulate time passing)
      const oldTxnId = "old_txn_004";
      (store as any).usedTransactionIds.add(oldTxnId);
      (store as any).transactionIdTimestamps.set(oldTxnId, Date.now() - 25 * 60 * 60 * 1000);

      // Trigger a save (which should cleanup old IDs)
      await store.setDeviceVerified(true);

      // Reload to verify cleanup persisted
      const store2 = new VerificationStore();
      await store2.initialize(tmpDir);

      // Recent ID should still be there
      expect(store2.isTransactionIdUsed(recentTxnId)).toBe(true);

      // Old ID should be cleaned up
      expect(store2.isTransactionIdUsed(oldTxnId)).toBe(false);

      // Cleanup
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    });
  });
});
