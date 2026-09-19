// Client twin of server/utils/barcodeId.js — kept in sync intentionally so
// an offline-generated token is indistinguishable from a server-generated
// one. Uses the browser's Web Crypto API (never Math.random) for anything
// security/collision-sensitive.

// Crockford Base32: excludes I, L, O, U so a hand-typed receipt number can't
// be confused with 1/L, 0/O, or misread U as V.
export const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const TOKEN_BYTE_LENGTH = 8; // 64 bits of randomness sourced from crypto.getRandomValues
export const TOKEN_CHAR_LENGTH = 12; // 60 bits kept (4-4-4 grouping), collision risk negligible at retail scale

export function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < bytes.length; i += 1) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += CROCKFORD_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += CROCKFORD_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

// Opaque, collision-resistant identifier encoded into the CODE128 barcode —
// generated locally so an offline sale has a permanent identity the moment
// it's created, before any server round-trip.
export function generateBarcodeToken(randomBytesFn: (length: number) => Uint8Array = randomBytes): string {
  const bytes = randomBytesFn(TOKEN_BYTE_LENGTH);
  return encodeBase32(bytes).slice(0, TOKEN_CHAR_LENGTH);
}

const BARCODE_TOKEN_PATTERN = new RegExp(`^[${CROCKFORD_ALPHABET}]{${TOKEN_CHAR_LENGTH}}$`);

export function isValidBarcodeToken(token: unknown): token is string {
  return typeof token === "string" && BARCODE_TOKEN_PATTERN.test(token);
}

// Human-readable rendering of the same token (dash-grouped), not a second
// random value — its uniqueness is inherited from the token's uniqueness.
export function formatReceiptNumber(token: string): string | null {
  if (!isValidBarcodeToken(token)) return null;
  return [token.slice(0, 4), token.slice(4, 8), token.slice(8, 12)].join("-");
}

// Idempotency key for a sale creation request (online or offline) — never
// printed or encoded, purely for safe retries.
export function generateClientSaleId(): string {
  return crypto.randomUUID();
}
