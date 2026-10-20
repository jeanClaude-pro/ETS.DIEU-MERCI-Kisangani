import test from "node:test";
import assert from "node:assert/strict";
import { csvRow, escapeCsvCell } from "./csv.ts";
import { canEditSale } from "./salePermissions.ts";
import { idleState, idleTimeoutMs, initialActivity, latestActivity, secondsUntilLogout } from "../services/idleTimer.ts";

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
  // Historical reservation records follow the sale rule (admin only).
  assert.equal(canEditSale("manager", { type: "reservation", status: "pending" }), false);
  assert.equal(canEditSale("admin", { type: "sale", status: "voided" }), false);
});

test("idle timer: 4 minutes without action signs out, warning from 3 minutes", () => {
  const timeout = idleTimeoutMs(undefined);
  assert.equal(timeout, 4 * 60_000);
  assert.equal(idleState(0, 2.9 * 60_000, timeout), "active");
  assert.equal(idleState(0, 3 * 60_000, timeout), "warning");
  assert.equal(idleState(0, 4 * 60_000, timeout), "expired");
  assert.equal(secondsUntilLogout(0, 3.5 * 60_000, timeout), 30);
});

test("idle timer: configuration may shorten the 4 minutes, never lengthen them", () => {
  assert.equal(idleTimeoutMs("2"), 2 * 60_000);
  assert.equal(idleTimeoutMs("20"), 4 * 60_000);
  assert.equal(idleTimeoutMs("0"), 4 * 60_000);
  assert.equal(idleTimeoutMs("abc"), 4 * 60_000);
});

test("idle timer: reopening the app resumes from the last recorded action", () => {
  assert.equal(initialActivity("5000", 900_000), 5000);
  assert.equal(initialActivity(null, 900_000), 900_000);
  assert.equal(initialActivity("garbage", 900_000), 900_000);
  // A clock that moved backwards never yields an activity in the future.
  assert.equal(initialActivity("999999999", 900_000), 900_000);
});

test("idle timer: activity in another tab keeps this tab signed in", () => {
  assert.equal(latestActivity(1000, "5000"), 5000);
  assert.equal(latestActivity(9000, "5000"), 9000);
  assert.equal(latestActivity(9000, null), 9000);
});
