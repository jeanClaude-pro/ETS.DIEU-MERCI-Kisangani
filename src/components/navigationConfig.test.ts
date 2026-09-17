import test from "node:test";
import assert from "node:assert/strict";
import { effectiveModulesForUser, defaultModulesForRole, ALL_MODULE_IDS } from "./navigationConfig.ts";

test("admin always gets every module regardless of stored modulePermissions", () => {
  assert.deepEqual(effectiveModulesForUser({ role: "admin", modulePermissions: ["pos"] }), ALL_MODULE_IDS);
  assert.deepEqual(effectiveModulesForUser({ role: "admin" }), ALL_MODULE_IDS);
});

test("a user without stored modulePermissions keeps exactly today's role-based access", () => {
  const staff = effectiveModulesForUser({ role: "staff" });
  assert.deepEqual(staff, defaultModulesForRole("staff"));
  assert.ok(staff.includes("sales"));
  assert.ok(!staff.includes("pos"));
  assert.ok(!staff.includes("management"));
});

test("an explicit modulePermissions array overrides the role default", () => {
  assert.deepEqual(effectiveModulesForUser({ role: "staff", modulePermissions: ["pos"] }), ["pos"]);
});

test("no user returns no modules", () => {
  assert.deepEqual(effectiveModulesForUser(null), []);
  assert.deepEqual(effectiveModulesForUser(undefined), []);
});
