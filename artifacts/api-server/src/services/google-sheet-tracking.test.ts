import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTrackingPhone, parseCsv, shipmentsForPhone } from "./google-sheet-tracking";

test("normalizes Egyptian and Arabic phone formats", () => {
  assert.equal(normalizeTrackingPhone("+20 101-234-5678"), "01012345678");
  assert.equal(normalizeTrackingPhone("٠١٠١٢٣٤٥٦٧٨"), "01012345678");
});

test("parses quoted multiline CSV cells", () => {
  assert.deepEqual(parseCsv('a,"line 1\nline 2"\r\nb,c'), [["a", "line 1\nline 2"], ["b", "c"]]);
});

test("returns every matching shipment without exposing customer data", () => {
  const header = Array(45).fill("");
  const first = Array(45).fill("");
  first[0] = "7"; first[1] = "اسم سري"; first[4] = "01012345678"; first[20] = "كتاب 1"; first[27] = "تم الشحن"; first[28] = "TRACK-1";
  const second = Array(45).fill("");
  second[5] = "+20 1012345678"; second[20] = "كتاب 2"; second[29] = "تم التسليم ";
  const results = shipmentsForPhone([header, header, first, second], "٠١٠١٢٣٤٥٦٧٨");
  assert.equal(results.length, 2);
  assert.equal(results[0].deliveryStatus, "تم التسليم");
  assert.equal("customerName" in results[0], false);
});
