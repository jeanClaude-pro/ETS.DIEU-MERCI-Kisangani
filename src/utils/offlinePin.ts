// PBKDF2-based offline PIN derivation (spec §14). The PIN itself is never
// stored, logged, or transmitted anywhere — only a random salt and the
// derived verifier are persisted locally (see `offlineUsers` in
// client/src/lib/offlineDb.ts). Uses Web Crypto exclusively; never
// Math.random for anything security-sensitive.

export const OFFLINE_PIN_PBKDF2_ITERATIONS = 310_000;
export const OFFLINE_PIN_DERIVED_KEY_BYTES = 32;
const SALT_BYTES = 16;

const PIN_PATTERN = /^\d{4,12}$/;

export function isValidPinFormat(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function generateSalt(randomBytesFn: (length: number) => Uint8Array = (length) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}): string {
  return toBase64(randomBytesFn(SALT_BYTES));
}

export async function deriveVerifier(pin: string, saltBase64: string): Promise<string> {
  const salt = fromBase64(saltBase64);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: OFFLINE_PIN_PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    OFFLINE_PIN_DERIVED_KEY_BYTES * 8,
  );
  return toBase64(new Uint8Array(derived));
}

// Constant-time comparison so a timing side-channel can't help an attacker
// narrow down the correct verifier.
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
