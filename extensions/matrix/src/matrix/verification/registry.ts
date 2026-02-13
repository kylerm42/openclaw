/**
 * Global registry for verification handlers.
 * Allows CLI commands to access verification state via gateway RPC.
 */

import type { VerificationHandler } from "./handler.js";

/**
 * Global registry of verification handlers by account ID.
 * This is populated when the Matrix monitor starts.
 */
const verificationHandlers = new Map<string, VerificationHandler>();

/**
 * Register a verification handler for an account.
 */
export function registerVerificationHandler(accountId: string, handler: VerificationHandler): void {
  verificationHandlers.set(accountId, handler);
}

/**
 * Unregister a verification handler for an account.
 */
export function unregisterVerificationHandler(accountId: string): void {
  verificationHandlers.delete(accountId);
}

/**
 * Get a verification handler for an account.
 */
export function getVerificationHandler(accountId: string): VerificationHandler | undefined {
  return verificationHandlers.get(accountId);
}

/**
 * Get the default verification handler (first registered).
 */
export function getDefaultVerificationHandler(): VerificationHandler | undefined {
  const first = verificationHandlers.values().next();
  return first.done ? undefined : first.value;
}
