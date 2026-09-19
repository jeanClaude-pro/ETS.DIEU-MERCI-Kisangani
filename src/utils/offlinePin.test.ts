import test from "node:test";
import assert from "node:assert/strict";
import {
  OFFLINE_PIN_DERIVED_KEY_BYTES,
  OFFLINE_PIN_PBKDF2_ITERATIONS,
  constantTimeEqual,
  deriveVerifier,
  generateSalt,
  isValidPinFormat,
} from "./offlinePin.ts";

test("isValidPinFormat: accepts 4-12 digit codes only", () => {
  assert.equal(isValidPinFormat("1234"), true);
  assert.equal(isValidPinFormat("123456789012"), true);
  assert.equal(isValidPinFormat("123"), false, "too short");
  assert.equal(isValidPinFormat("1234567890123"), false, "too long");
  assert.equal(isValidPinFormat("12a4"), false, "non-digit");
  assert.equal(isValidPinFormat(""), false);
});

test("generateSalt: uses the injected random source, never a fixed value", () => {
  const salt1 = generateSalt();
  const salt2 = generateSalt();
  assert.notEqual(salt1, salt2);
});

test("deriveVerifier: deterministic for the same PIN+salt, and matches spec parameters", async () => {
  assert.equal(OFFLINE_PIN_PBKDF2_ITERATIONS, 310_000);
  assert.equal(OFFLINE_PIN_DERIVED_KEY_BYTES, 32);
  const salt = generateSalt();
  const a = await deriveVerifier("135790", salt);
  const b = await deriveVerifier("135790", salt);
  assert.equal(a, b);
  // 32 bytes base64-encoded is 44 chars with padding.
  assert.equal(Buffer.from(a, "base64").length, 32);
});

test("deriveVerifier: a different PIN or a different salt both change the verifier", async () => {
  const saltA = generateSalt();
  const saltB = generateSalt();
  const base = await deriveVerifier("246810", saltA);
  const differentPin = await deriveVerifier("246811", saltA);
  const differentSalt = await deriveVerifier("246810", saltB);
  assert.notEqual(base, differentPin);
  assert.notEqual(base, differentSalt);
});

test("constantTimeEqual: equal strings match, unequal strings (including different lengths) don't", () => {
  assert.equal(constantTimeEqual("abc", "abc"), true);
  assert.equal(constantTimeEqual("abc", "abd"), false);
  assert.equal(constantTimeEqual("abc", "abcd"), false);
});
