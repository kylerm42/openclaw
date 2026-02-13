/**
 * Device verification types for Matrix SAS verification protocol.
 * Based on Matrix Client-Server API v1.11 device verification spec.
 */

/**
 * Verification session state machine states.
 */
export type VerificationState =
  | "requested" // Initial request sent or received
  | "ready" // Other party has accepted the request
  | "started" // SAS verification has begun
  | "keys_exchanged" // Public keys have been exchanged
  | "confirming" // Waiting for user to confirm emoji match
  | "done" // Verification completed successfully
  | "cancelled"; // Verification was cancelled or timed out

/**
 * Direction of the verification request.
 * Phase 1: only "outgoing" (bot-initiated)
 * Phase 2: will add "incoming" (Element-initiated)
 * Type defined as union now to prevent breaking changes in Phase 2.
 * Runtime validation enforces "outgoing" only in Phase 1.
 */
export type VerificationDirection = "outgoing" | "incoming";

/**
 * Verification method.
 */
export type VerificationMethod = "m.sas.v1";

/**
 * SAS emoji representation.
 */
export interface SasEmoji {
  emoji: string;
  name: string;
}

/**
 * Active verification session.
 */
export interface VerificationSession {
  /** Unique transaction ID for this verification session */
  transactionId: string;

  /** Direction of verification request */
  direction: VerificationDirection;

  /** Our user ID (self-verification) */
  targetUserId: string;

  /** Element's device ID that we're verifying with */
  targetDeviceId: string;

  /** Verification method */
  method: VerificationMethod;

  /** Current state of verification */
  state: VerificationState;

  /** Our Curve25519 public key (base64) */
  ourPublicKey?: string;

  /** Their Curve25519 public key (base64) */
  theirPublicKey?: string;

  /** Computed SAS emoji (7 emoji) */
  sasEmoji?: SasEmoji[];

  /** Their commitment hash (for SAS protocol) */
  commitment?: string;

  /** Timestamp when session was created (milliseconds) */
  createdAt: number;

  /** Timestamp when session expires (milliseconds) */
  expiresAt: number;
}

/**
 * In-memory verification store state.
 */
export interface VerificationStoreState {
  /** Active verification sessions by transaction ID */
  activeSessions: Map<string, VerificationSession>;

  /** Whether our device is verified */
  deviceVerified: boolean;
}

/**
 * Matrix to-device event wrapper.
 */
export interface ToDeviceEvent<T = Record<string, unknown>> {
  type: string;
  content: T;
  sender?: string;
}

/**
 * m.key.verification.request content
 */
export interface KeyVerificationRequest {
  from_device: string;
  transaction_id: string;
  methods: string[];
  timestamp: number;
}

/**
 * m.key.verification.ready content
 */
export interface KeyVerificationReady {
  from_device: string;
  transaction_id: string;
  methods: string[];
}

/**
 * m.key.verification.start (SAS) content
 */
export interface KeyVerificationStart {
  from_device: string;
  transaction_id: string;
  method: string;
  key_agreement_protocols: string[];
  hashes: string[];
  message_authentication_codes: string[];
  short_authentication_string: string[];
}

/**
 * m.key.verification.key content
 */
export interface KeyVerificationKey {
  transaction_id: string;
  key: string;
}

/**
 * m.key.verification.mac content
 */
export interface KeyVerificationMac {
  transaction_id: string;
  mac: Record<string, string>;
  keys: string;
}

/**
 * m.key.verification.done content
 */
export interface KeyVerificationDone {
  transaction_id: string;
}

/**
 * m.key.verification.cancel content
 */
export interface KeyVerificationCancel {
  transaction_id: string;
  code: string;
  reason: string;
}

/**
 * Cancellation codes per Matrix spec.
 */
export const CancelCode = {
  USER: "m.user",
  TIMEOUT: "m.timeout",
  UNKNOWN_TRANSACTION: "m.unknown_transaction",
  UNKNOWN_METHOD: "m.unknown_method",
  UNEXPECTED_MESSAGE: "m.unexpected_message",
  KEY_MISMATCH: "m.key_mismatch",
  USER_MISMATCH: "m.user_mismatch",
  INVALID_MESSAGE: "m.invalid_message",
  ACCEPTED: "m.accepted",
  SAS_MISMATCH: "m.mismatched_sas",
} as const;
