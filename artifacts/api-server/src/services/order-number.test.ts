import test from "node:test";
import assert from "node:assert/strict";
import { generateOrderNumber, isPostgresUniqueViolation, withUniqueOrderNumber } from "./order-number";

const collision = () => Object.assign(new Error("duplicate"), { code: "23505", constraint: "orders_order_number_unique" });

test("order number preserves the public format", () => {
  assert.match(generateOrderNumber(new Date("2026-08-16T12:00:00Z")), /^MK260816-\d{5}$/);
});

test("order creation retries only order-number collisions", async () => {
  const generated = ["MK260816-10000", "MK260816-10001"];
  let calls = 0;
  const result = await withUniqueOrderNumber(async orderNumber => {
    calls += 1;
    if (calls === 1) throw collision();
    return orderNumber;
  }, { generate: () => generated.shift()!, maxAttempts: 3 });

  assert.equal(result, "MK260816-10001");
  assert.equal(calls, 2);
});

test("unrelated unique violations are not retried", async () => {
  let calls = 0;
  await assert.rejects(withUniqueOrderNumber(async () => {
    calls += 1;
    throw Object.assign(new Error("duplicate checkout token"), { code: "23505", constraint: "orders_checkout_token_unique" });
  }), /duplicate checkout token/);
  assert.equal(calls, 1);
});

test("unique violations are detected through wrapped database errors", () => {
  assert.equal(isPostgresUniqueViolation({ cause: collision() }, "orders_order_number_unique"), true);
  assert.equal(isPostgresUniqueViolation(collision(), "orders_checkout_token_unique"), false);
});
