/**
 * Verification session store with persistence support.
 * Manages active verification sessions and device verification state.
 */

import type { RuntimeLogger } from "openclaw/plugin-sdk";
import fs from "node:fs";
import path from "node:path";
import { lock } from "proper-lockfile";
import type { VerificationSession } from "./types.js";

interface VerificationPersistedState {
  deviceVerified: boolean;
  lastVerified?: number;
  usedTransactionIds: Array<{ id: string; timestamp: number }>;
}

/**
 * Verification store managing active sessions.
 */
export class VerificationStore {
  private activeSessions: Map<string, VerificationSession> = new Map();
  private deviceVerified = false;
  private storageDir?: string;
  private usedTransactionIds: Set<string> = new Set();
  private transactionIdTimestamps: Map<string, number> = new Map();

  constructor(private logger?: RuntimeLogger) {}

  /**
   * Add or update a verification session.
   */
  setSession(session: VerificationSession): void {
    this.activeSessions.set(session.transactionId, session);
  }

  /**
   * Get a verification session by transaction ID.
   */
  getSession(transactionId: string): VerificationSession | undefined {
    return this.activeSessions.get(transactionId);
  }

  /**
   * Get all active sessions.
   */
  getAllSessions(): VerificationSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Remove a verification session.
   */
  removeSession(transactionId: string): void {
    this.activeSessions.delete(transactionId);
  }

  /**
   * Clear all sessions (e.g., on gateway restart).
   */
  clearSessions(): void {
    this.activeSessions.clear();
  }

  /**
   * Initialize store with optional persistence directory.
   * Loads verification state from disk if available.
   */
  async initialize(storageDir?: string): Promise<void> {
    this.storageDir = storageDir;
    if (storageDir) {
      await this.loadPersistedState();
    }
  }

  /**
   * Mark device as verified and persist state.
   */
  async setDeviceVerified(verified: boolean): Promise<void> {
    this.deviceVerified = verified;
    if (this.storageDir) {
      await this.savePersistedState();
    }
  }

  /**
   * Check if device is verified.
   */
  isDeviceVerified(): boolean {
    return this.deviceVerified;
  }

  /**
   * Check if a transaction ID has been used before (replay protection).
   */
  isTransactionIdUsed(transactionId: string): boolean {
    return this.usedTransactionIds.has(transactionId);
  }

  /**
   * Register a transaction ID as used.
   * Should be called when processing a new verification event.
   */
  async registerTransactionId(transactionId: string): Promise<void> {
    this.usedTransactionIds.add(transactionId);
    this.transactionIdTimestamps.set(transactionId, Date.now());

    // Persist to disk
    if (this.storageDir) {
      await this.savePersistedState();
    }
  }

  /**
   * Get path to persisted state file.
   */
  private getStatePath(): string | undefined {
    return this.storageDir ? path.join(this.storageDir, "verification-state.json") : undefined;
  }

  /**
   * Load device verification state from disk.
   */
  private async loadPersistedState(): Promise<void> {
    const statePath = this.getStatePath();
    if (!statePath) {
      return;
    }

    try {
      if (!fs.existsSync(statePath)) {
        return;
      }

      // Acquire file lock
      const release = await lock(statePath, { retries: { retries: 3, minTimeout: 100 } });
      try {
        const data = await fs.promises.readFile(statePath, "utf8");
        const state = JSON.parse(data) as VerificationPersistedState;
        this.deviceVerified = state.deviceVerified ?? false;

        // Load used transaction IDs and cleanup old ones (older than 24 hours)
        const now = Date.now();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        for (const entry of state.usedTransactionIds ?? []) {
          if (now - entry.timestamp < twentyFourHours) {
            this.usedTransactionIds.add(entry.id);
            this.transactionIdTimestamps.set(entry.id, entry.timestamp);
          }
        }
      } finally {
        await release();
      }
    } catch (error) {
      this.logger?.warn("matrix: failed to load persisted verification state", {
        error: String(error),
      });
    }
  }

  /**
   * Save device verification state to disk.
   */
  private async savePersistedState(): Promise<void> {
    const statePath = this.getStatePath();
    if (!statePath) {
      return;
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(statePath);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }

      // Cleanup old transaction IDs before saving (keep only last 24 hours)
      const now = Date.now();
      const twentyFourHours = 24 * 60 * 60 * 1000;
      const usedTransactionIds: Array<{ id: string; timestamp: number }> = [];

      // Use Array.from to iterate over Set (compatible with downlevel iteration)
      const transactionIdArray = Array.from(this.usedTransactionIds);
      for (const id of transactionIdArray) {
        const timestamp = this.transactionIdTimestamps.get(id);
        if (timestamp && now - timestamp < twentyFourHours) {
          usedTransactionIds.push({ id, timestamp });
        } else {
          // Remove expired IDs
          this.usedTransactionIds.delete(id);
          this.transactionIdTimestamps.delete(id);
        }
      }

      const state: VerificationPersistedState = {
        deviceVerified: this.deviceVerified,
        lastVerified: this.deviceVerified ? Date.now() : undefined,
        usedTransactionIds,
      };

      // Ensure file exists before locking (proper-lockfile requires it)
      if (!fs.existsSync(statePath)) {
        await fs.promises.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
      } else {
        // Acquire file lock before writing
        const release = await lock(statePath, { retries: { retries: 3, minTimeout: 100 } });
        try {
          await fs.promises.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
        } finally {
          await release();
        }
      }
    } catch (error) {
      this.logger?.warn("matrix: failed to save persisted verification state", {
        error: String(error),
      });
    }
  }

  /**
   * Clean up expired sessions.
   * Should be called periodically to remove timed-out sessions.
   */
  cleanupExpiredSessions(): number {
    const now = Date.now();
    let removedCount = 0;

    const entries = Array.from(this.activeSessions.entries());
    for (let i = 0; i < entries.length; i++) {
      const [txnId, session] = entries[i];
      if (session.expiresAt <= now) {
        this.activeSessions.delete(txnId);
        removedCount++;
      }
    }

    return removedCount;
  }

  /**
   * Get the most recent active session (for CLI commands).
   */
  getMostRecentSession(): VerificationSession | undefined {
    const sessions = this.getAllSessions();
    if (sessions.length === 0) {
      return undefined;
    }

    // Sort by creation time, most recent first
    sessions.sort((a, b) => b.createdAt - a.createdAt);
    return sessions[0];
  }
}

/**
 * Global verification store instance (singleton).
 * In a production setup, this could be passed via dependency injection.
 */
export const globalVerificationStore = new VerificationStore();
