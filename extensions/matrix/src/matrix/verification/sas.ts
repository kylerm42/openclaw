/**
 * SAS (Short Authentication String) emoji computation using HKDF-SHA256.
 * Implements the Matrix spec algorithm for deriving 7 emoji from public keys.
 *
 * Reference: https://spec.matrix.org/v1.11/client-server-api/#sas-hkdf-calculation
 */

import { createHmac } from "node:crypto";
import { SAS_EMOJI, type SasEmojiDefinition } from "./emoji.js";

/**
 * Compute SAS emoji from two Curve25519 public keys.
 *
 * Algorithm per Matrix spec:
 * 1. Concatenate public keys in lexicographic order (base64 strings)
 * 2. Use HKDF-SHA256 with Matrix info string
 * 3. Take first 6 bytes of output
 * 4. Map to 7 emoji indices (6 bytes * 8 bits / 6 bits per emoji = 8 indices, use first 7)
 *
 * @param ourUserId - Our Matrix user ID
 * @param ourDeviceId - Our device ID
 * @param ourPublicKey - Our Curve25519 public key (base64-encoded)
 * @param theirUserId - Their Matrix user ID
 * @param theirDeviceId - Their device ID
 * @param theirPublicKey - Their Curve25519 public key (base64-encoded)
 * @param transactionId - Transaction ID for this verification
 * @returns Array of 7 SAS emoji
 */
export function computeSasEmoji(
  ourUserId: string,
  ourDeviceId: string,
  ourPublicKey: string,
  theirUserId: string,
  theirDeviceId: string,
  theirPublicKey: string,
  transactionId: string,
): SasEmojiDefinition[] {
  // Step 1: Concatenate public keys in lexicographic order
  const keys = [ourPublicKey, theirPublicKey].sort();
  const inputKeyMaterial = `${keys[0]}${keys[1]}`;

  // Step 2: Compute HKDF-SHA256
  // Info string as per Matrix spec section 11.12.2.2.2:
  // "MATRIX_KEY_VERIFICATION_SAS|<alice_id>|<alice_device>|<alice_key>|<bob_id>|<bob_device>|<bob_key>|<transaction_id>"
  // Fields must be sorted lexicographically by user ID, then device ID
  const participants = [
    { userId: ourUserId, deviceId: ourDeviceId, key: ourPublicKey },
    { userId: theirUserId, deviceId: theirDeviceId, key: theirPublicKey },
  ].sort((a, b) => {
    // Sort by user ID first, then device ID
    if (a.userId !== b.userId) {
      return a.userId < b.userId ? -1 : 1;
    }
    return a.deviceId < b.deviceId ? -1 : 1;
  });

  const info =
    `MATRIX_KEY_VERIFICATION_SAS|${participants[0].userId}|${participants[0].deviceId}|${participants[0].key}|` +
    `${participants[1].userId}|${participants[1].deviceId}|${participants[1].key}|${transactionId}`;
  const salt = Buffer.alloc(32); // Empty salt per spec

  // HKDF extract-then-expand
  const prk = hkdfExtract(salt, Buffer.from(inputKeyMaterial, "utf8"));
  const okm = hkdfExpand(prk, Buffer.from(info, "utf8"), 6); // Need 6 bytes for 7 emoji

  // Step 3: Convert bytes to emoji indices
  // Each emoji uses ~6 bits (2^6 = 64 emoji)
  // 6 bytes = 48 bits → 8 possible emoji (48/6 = 8), but spec says use first 7
  const indices = bytesToEmojiIndices(okm, 7);

  // Step 4: Map indices to emoji
  return indices.map((index) => SAS_EMOJI[index]);
}

/**
 * HKDF Extract step: PRK = HMAC-SHA256(salt, IKM)
 */
function hkdfExtract(salt: Buffer, ikm: Buffer): Buffer {
  const hmac = createHmac("sha256", salt.length > 0 ? salt : Buffer.alloc(32));
  hmac.update(ikm);
  return hmac.digest();
}

/**
 * HKDF Expand step: OKM = HMAC-SHA256(PRK, info | 0x01) [truncated to length]
 */
function hkdfExpand(prk: Buffer, info: Buffer, length: number): Buffer {
  const hmac = createHmac("sha256", prk);
  hmac.update(info);
  hmac.update(Buffer.from([0x01])); // Counter byte
  const okm = hmac.digest();
  return okm.subarray(0, length);
}

/**
 * Convert bytes to emoji indices.
 * Each emoji is represented by 6 bits (0-63).
 *
 * Algorithm:
 * - Take 6 bytes (48 bits)
 * - Split into 6-bit chunks
 * - Each chunk is an emoji index (0-63)
 * - Return first `count` emoji indices
 *
 * Example:
 * Byte 0: AAAAAA BB
 * Byte 1: BBBB CCCC
 * Byte 2: CC DDDDDD
 * Byte 3: EEEEEE FF
 * Byte 4: FFFF GGGG
 * Byte 5: GG HHHHHH
 *
 * Emoji: A, B, C, D, E, F, G, (H - not used for 7 emoji)
 */
function bytesToEmojiIndices(bytes: Buffer, count: number): number[] {
  const indices: number[] = [];
  let bitBuffer = 0;
  let bitsInBuffer = 0;

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    bitBuffer = (bitBuffer << 8) | byte;
    bitsInBuffer += 8;

    while (bitsInBuffer >= 6 && indices.length < count) {
      const index = (bitBuffer >> (bitsInBuffer - 6)) & 0x3f; // Extract top 6 bits
      indices.push(index);
      bitsInBuffer -= 6;
    }

    if (indices.length >= count) {
      break;
    }
  }

  return indices;
}

/**
 * Generate a random Curve25519 key pair for testing.
 * In production, use the crypto client's actual device keys.
 *
 * @returns Object with publicKey (base64) and privateKey (base64)
 */
export function generateTestKeyPair(): { publicKey: string; privateKey: string } {
  // For testing purposes, generate random 32-byte keys
  // In production, use the actual Curve25519 key generation
  const publicKey = Buffer.from(
    Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)),
  ).toString("base64");
  const privateKey = Buffer.from(
    Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)),
  ).toString("base64");

  return { publicKey, privateKey };
}
