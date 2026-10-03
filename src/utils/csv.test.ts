import test from "node:test";
import assert from "node:assert/strict";
import { csvRow, escapeCsvCell } from "./csv.ts";
import { canEditSale } from "./salePermissions.ts";
import { idleState, idleTimeoutMs, latestActivity, secondsUntilLogout } from "../services/idleTimer.ts";

test("escapeCsvCell: formula-looking values are neutralised", () => {
  assert.equal(escapeCsvCell("=1+1"), `"'=1+1"`);
  assert.equal(escapeCsvCell("+243 81"), `"'+243 81"`);
  assert.equal(escapeCsvCell("-5"), `"'-5"`);
  assert.equal(escapeCsvCell("@SUM(A1)"), `"'@SUM(A1)"`);
  assert.equal(escapeCsvCell("\tcmd"), `"'\tcmd"`);
});

test("escapeCsvCell: quotes are doubled so a value cannot break out of its cell", () => {
  assert.equal(escapeCsvCell('Jean "le chef"'), `"Jean ""le chef"""`);
  assert.equal(escapeCsvCell('a",=HYPERLINK("x")'), `"a"",=HYPERLINK(""x"")"`);
});

test("escapeCsvCell: HTML-looking names stay inert text", () => {
  assert.equal(escapeCsvCell("<img src=x onerror=alert(1)>"), `"<img src=x onerror=alert(1)>"`);
});

test("escapeCsvCell: numbers stay numeric, empty values stay empty", () => {
  assert.equal(escapeCsvCell(12.5), "12.5");
  assert.equal(escapeCsvCell(-3), "-3");
  assert.equal(escapeCsvCell(null), '""');
  assert.equal(csvRow(["a", 1, undefined]), '"a",1,""');
});

test("canEditSale mirrors the server rules", () => {
  const sale = { type: "sale", status: "completed" };
  assert.equal(canEditSale("admin", sale), true);
  assert.equal(canEditSale("manager", sale), false);
  assert.equal(canEditSale("staff", sale), false);
  assert.equal(canEditSale("manager", { type: "reservation", status: "pending" }), true);
  assert.equal(canEditSale("manager", { type: "reservation", status: "completed" }), false);
  assert.equal(canEditSale("admin", { type: "sale", status: "voided" }), false);
});

test("idle timer: warns in the last minute and expires at the timeout", () => {
  const timeout = idleTimeoutMs(20);
  assert.equal(timeout, 20 * 60_000);
  assert.equal(idleState(0, 10 * 60_000, timeout), "active");
  assert.equal(idleState(0, 19.5 * 60_000, timeout), "warning");
  assert.equal(idleState(0, 20 * 60_000, timeout), "expired");
  assert.equal(secondsUntilLogout(0, 19.5 * 60_000, timeout), 30);
});

test("idle timer: invalid configuration falls back to 20 minutes", () => {
  assert.equal(idleTimeoutMs(undefined), 20 * 60_000);
  assert.equal(idleTimeoutMs("0"), 20 * 60_000);
  assert.equal(idleTimeoutMs("abc"), 20 * 60_000);
  assert.equal(idleTimeoutMs("30"), 30 * 60_000);
});

test("idle timer: activity in another tab keeps this tab signed in", () => {
  assert.equal(latestActivity(1000, "5000"), 5000);
  assert.equal(latestActivity(9000, "5000"), 9000);
  assert.equal(latestActivity(9000, null), 9000);
});
