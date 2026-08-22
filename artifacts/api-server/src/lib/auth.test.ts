import test from "node:test";
import assert from "node:assert/strict";
import { isAdminSessionExpired } from "./auth";

test("admin idle timeout expires missing and stale activity timestamps", () => {
  const now = 10_000;
  assert.equal(isAdminSessionExpired(undefined, now, 1_000), true);
  assert.equal(isAdminSessionExpired(8_999, now, 1_000), true);
  assert.equal(isAdminSessionExpired(9_000, now, 1_000), false);
  assert.equal(isAdminSessionExpired(9_999, now, 1_000), false);
});
