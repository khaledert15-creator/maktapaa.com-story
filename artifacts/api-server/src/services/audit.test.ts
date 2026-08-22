import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeAuditData } from "./audit";

test("audit data recursively redacts credentials without dropping useful fields", () => {
  assert.deepEqual(sanitizeAuditData({
    id: 7,
    passwordHash: "hash",
    nested: { accessToken: "token", status: "active" },
    entries: [{ sessionSecret: "secret", name: "employee" }],
  }), {
    id: 7,
    passwordHash: "[REDACTED]",
    nested: { accessToken: "[REDACTED]", status: "active" },
    entries: [{ sessionSecret: "[REDACTED]", name: "employee" }],
  });
});
