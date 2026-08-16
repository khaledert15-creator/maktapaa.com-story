import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSearchTerm } from "./search";

test("search normalizes Arabic and Persian digits without changing Arabic text", () => {
  assert.equal(normalizeSearchTerm("  كتاب  الصف ٣  ۲۰۲۶  "), "كتاب الصف 3 2026");
  assert.equal(normalizeSearchTerm("SKU-١٢٣"), "SKU-123");
});
