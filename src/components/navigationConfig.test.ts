import test from "node:test";
import assert from "node:assert/strict";
import { effectiveModulesForUser, defaultModulesForRole, ALL_MODULE_IDS, permittedNavigationItems } from "./navigationConfig.ts";

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

test("explicit POS access also exposes its synchronization safety companion", () => {
  assert.deepEqual(effectiveModulesForUser({ role: "staff", modulePermissions: ["pos"] }), ["pos", "sync"]);
});

test("no user returns no modules", () => {
  assert.deepEqual(effectiveModulesForUser(null), []);
  assert.deepEqual(effectiveModulesForUser(undefined), []);
});

test("permission-aware navigation always exposes Home but never leaks restricted modules", () => {
  const items = permittedNavigationItems({ role: "staff", modulePermissions: ["sales"] });
  assert.deepEqual(items.map((item) => item.id), ["home", "sales"]);
  assert.equal(items.find((item) => item.id === "home")?.path, "/");
  assert.equal(items.find((item) => item.id === "sales")?.path, "/sales");
});

test("the point-of-sale module opens after the welcome route", () => {
  const items = permittedNavigationItems({ role: "cashier_supervisor", modulePermissions: ["pos"] });
  assert.equal(items.find((item) => item.id === "pos")?.path, "/new-sale");
});

test("default frontend roles mirror the server module registry", () => {
  assert.deepEqual(defaultModulesForRole("manager"), [
    "dashboard", "rate", "pos", "reservation", "entry", "sortie", "products",
    "sales", "sync", "scanner", "reservations", "entryhistory", "sortiehistory", "customers",
  ]);
  assert.deepEqual(defaultModulesForRole("inventory_manager"), [
    "pos", "reservation", "entry", "sortie", "products", "sales", "sync", "scanner",
    "reservations", "entryhistory", "sortiehistory",
  ]);
  assert.deepEqual(defaultModulesForRole("cashier_supervisor"), [
    "pos", "reservation", "entry", "sortie", "sales", "sync", "scanner", "reservations",
    "entryhistory", "sortiehistory", "customers",
  ]);
  assert.deepEqual(defaultModulesForRole("staff"), ["sales", "scanner"]);
});
