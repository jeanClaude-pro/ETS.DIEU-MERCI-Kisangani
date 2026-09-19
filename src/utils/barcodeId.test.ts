import test from "node:test";
import assert from "node:assert/strict";
import {
  CROCKFORD_ALPHABET,
  TOKEN_CHAR_LENGTH,
  encodeBase32,
  formatReceiptNumber,
  generateBarcodeToken,
  generateClientSaleId,
  isValidBarcodeToken,
} from "./barcodeId.ts";

test("generateBarcodeToken: produces a token of the expected length and charset", () => {
  const token = generateBarcodeToken();
  assert.equal(token.length, TOKEN_CHAR_LENGTH);
  for (const char of token) {
    assert.ok(CROCKFORD_ALPHABET.includes(char), `unexpected character "${char}" in token`);
  }
  assert.ok(isValidBarcodeToken(token));
});

test("generateBarcodeToken: matches the server's format contract exactly (kept in sync intentionally)", () => {
  // Same alphabet, same length as server/utils/barcodeId.js — an offline
  // token must be indistinguishable from a server-generated one.
  assert.equal(CROCKFORD_ALPHABET, "0123456789ABCDEFGHJKMNPQRSTVWXYZ");
  assert.equal(TOKEN_CHAR_LENGTH, 12);
});

test("generateBarcodeToken: is deterministic given the same random source", () => {
  const fixedBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const tokenA = generateBarcodeToken(() => fixedBytes);
  const tokenB = generateBarcodeToken(() => fixedBytes);
  assert.equal(tokenA, tokenB);
});

test("generateBarcodeToken: 5000 samples from real Web Crypto never collide", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 5000; i += 1) {
    const token = generateBarcodeToken();
    assert.ok(!seen.has(token), `unexpected collision on sample ${i}`);
    seen.add(token);
  }
});

test("isValidBarcodeToken: rejects wrong length, lowercase, and excluded characters", () => {
  assert.equal(isValidBarcodeToken("ABCDEFGHJKMN"), true);
  assert.equal(isValidBarcodeToken("ABCDEFGHJKM"), false);
  assert.equal(isValidBarcodeToken("abcdefghjkmn"), false);
  assert.equal(isValidBarcodeToken("ABCDEFGHIJKM"), false); // excluded "I"
  assert.equal(isValidBarcodeToken(""), false);
  assert.equal(isValidBarcodeToken(null), false);
  assert.equal(isValidBarcodeToken(undefined), false);
});

test("formatReceiptNumber: dash-groups a valid token into 4-4-4", () => {
  assert.equal(formatReceiptNumber("ABCDEFGHJKMN"), "ABCD-EFGH-JKMN");
});

test("formatReceiptNumber: returns null for a malformed token instead of throwing", () => {
  assert.equal(formatReceiptNumber("nope"), null);
});

test("encodeBase32: empty input yields empty string", () => {
  assert.equal(encodeBase32(new Uint8Array(0)), "");
});

test("generateClientSaleId: produces distinct RFC-4122-shaped UUIDs", () => {
  const a = generateClientSaleId();
  const b = generateClientSaleId();
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});
