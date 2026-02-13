/**
 * Gateway RPC methods for Matrix-specific operations.
 * Handles device verification commands from CLI.
 */

import type { GatewayRequestHandlers } from "./types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/**
 * Lazily import the verification registry from the Matrix extension.
 * This avoids hard-coupling the core to the extension.
 */
async function getVerificationRegistry() {
  try {
    return await import("../../../extensions/matrix/src/matrix/verification/registry.js");
  } catch (error) {
    throw new Error("Matrix extension not loaded or verification not available", { cause: error });
  }
}

/**
 * Get Matrix verification status.
 * Returns device ID, verification state, and active session details.
 */
async function handleVerificationStatus() {
  const registry = await getVerificationRegistry();
  const verificationHandler = registry.getDefaultVerificationHandler();

  if (!verificationHandler) {
    throw new Error(
      "Matrix verification not available - ensure Matrix is configured with encryption enabled and gateway is running",
    );
  }

  const store = verificationHandler.getStore();
  const deviceVerified = store.isDeviceVerified();
  const mostRecentSession = store.getMostRecentSession();

  // Access deviceId directly from handler (passed in constructor)
  const deviceId = (verificationHandler as unknown as { deviceId: string }).deviceId ?? "unknown";

  return {
    deviceId,
    verified: deviceVerified,
    activeSession: mostRecentSession
      ? {
          transactionId: mostRecentSession.transactionId,
          state: mostRecentSession.state,
          emoji: mostRecentSession.sasEmoji?.map((e) => ({ emoji: e.emoji, name: e.name })),
          expiresAt: mostRecentSession.expiresAt,
          createdAt: mostRecentSession.createdAt,
        }
      : null,
  };
}

/**
 * Confirm emoji match and complete verification.
 */
async function handleVerificationConfirm(params: { transactionId?: string }) {
  const registry = await getVerificationRegistry();
  const verificationHandler = registry.getDefaultVerificationHandler();

  if (!verificationHandler) {
    throw new Error("Matrix verification not available");
  }

  await verificationHandler.confirmEmoji(params.transactionId);

  return {
    success: true,
    message: "Verification confirmation sent - waiting for Element to complete",
  };
}

/**
 * Cancel active verification session.
 */
async function handleVerificationCancel(params: { transactionId?: string; reason?: string }) {
  const registry = await getVerificationRegistry();
  const verificationHandler = registry.getDefaultVerificationHandler();

  if (!verificationHandler) {
    throw new Error("Matrix verification not available");
  }

  await verificationHandler.cancelVerification(
    params.transactionId,
    params.reason ?? "User cancelled via CLI",
  );

  return {
    success: true,
    message: "Verification cancelled",
  };
}

export const matrixHandlers: GatewayRequestHandlers = {
  "matrix.verify.status": async ({ respond }) => {
    try {
      const result = await handleVerificationStatus();
      respond(true, result);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(error)));
    }
  },

  "matrix.verify.confirm": async ({ params, respond }) => {
    try {
      const result = await handleVerificationConfirm(params as { transactionId?: string });
      respond(true, result);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(error)));
    }
  },

  "matrix.verify.cancel": async ({ params, respond }) => {
    try {
      const result = await handleVerificationCancel(
        params as { transactionId?: string; reason?: string },
      );
      respond(true, result);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(error)));
    }
  },
};
