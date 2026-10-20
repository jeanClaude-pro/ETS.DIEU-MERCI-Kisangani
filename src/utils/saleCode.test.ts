import test from "node:test";
import assert from "node:assert/strict";
import { canonicalSaleCode, isSaleCode, saleCodeFor, saleCodeMatches } from "./saleCode.ts";

// Same vectors as server/utils/saleCode.test.js: both sides must agree.
const VECTORS: [Parameters<typeof saleCodeFor>[0], string][] = [
  [{ type: "sale", occurredAt: "2026-10-20T08:12:00.000Z", barcodeToken: "K7QM3XRT9PNW" }, "V-261020-K7QM3"],
  [{ type: "sale", occurredAt: "2026-12-31T22:30:00.000Z", barcodeToken: "0123456789AB" }, "V-270101-01234"],
  [{ type: "sale", occurredAt: "2026-02-28T21:59:59.999Z", barcodeToken: "ZYXWVTSRQPNM" }, "V-260228-ZYXWV"],
];

test("client sale codes match the server for the same sale", () => {
  for (const [input, expected] of VECTORS) assert.equal(saleCodeFor(input), expected);
  assert.ok(isSaleCode("V-260228-ZYXWV"));
  assert.equal(isSaleCode("R-260228-ZYXWV"), false);
  assert.equal(saleCodeFor({ type: "sale", occurredAt: "2026-10-20T08:00:00Z", barcodeToken: "bad" }), null);
});

test("typed codes are found with or without dashes", () => {
  assert.equal(canonicalSaleCode("v261020k7qm3"), "V-261020-K7QM3");
  assert.ok(saleCodeMatches("V-261020-K7QM3", "261020"));
  assert.ok(saleCodeMatches("V-261020-K7QM3", "k7qm3"));
  assert.ok(saleCodeMatches("V-261020-K7QM3", "v-261020-k7"));
  assert.equal(saleCodeMatches("V-261020-K7QM3", "261021"), false);
  assert.equal(saleCodeMatches(undefined, "261020"), false);
});
