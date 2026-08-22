import test from "node:test";
import assert from "node:assert/strict";
import {
  amountsEqual,
  assessPaymentRisk,
  calculateRequiredPayment,
  normalizePaymentSender,
  normalizeTransactionReference,
  paymentProofFingerprint,
  toEnglishDigits,
} from "./manual-payments";

test("manual payment amount plans preserve the order snapshot", () => {
  assert.equal(calculateRequiredPayment(1_500, "deposit_100"), 100);
  assert.equal(calculateRequiredPayment(2_000, "deposit_100"), 100);
  assert.equal(calculateRequiredPayment(2_000.01, "deposit_100"), 150);
  assert.equal(calculateRequiredPayment(2_500, "deposit_100"), 150);
  assert.equal(calculateRequiredPayment(80, "deposit_100"), 80);
  assert.equal(calculateRequiredPayment(1_500.55, "full"), 1_500.55);
  assert.equal(amountsEqual(100, 100.004), true);
  assert.equal(amountsEqual(100, 100.01), false);
});

test("Arabic digits and Egyptian sender phones normalize to one identity", () => {
  assert.equal(toEnglishDigits("٠١٢٣٤٥٦٧٨٩"), "0123456789");
  assert.equal(normalizePaymentSender("٠١٠ ١٢٣٤ ٥٦٧٨"), "01012345678");
  assert.equal(normalizePaymentSender("201012345678"), "01012345678");
  assert.equal(normalizePaymentSender("+20 10 1234 5678"), "01012345678");
  assert.equal(
    normalizePaymentSender("  Student.Name@InstaPay  "),
    "student.name@instapay",
  );
});

test("transaction references and proof images receive stable fingerprints", () => {
  assert.equal(normalizeTransactionReference(" ab-١٢ 34 "), "AB1234");
  assert.equal(normalizeTransactionReference("  "), null);
  assert.equal(
    paymentProofFingerprint(Buffer.from("same")),
    paymentProofFingerprint(Buffer.from("same")),
  );
  assert.notEqual(
    paymentProofFingerprint(Buffer.from("same")),
    paymentProofFingerprint(Buffer.from("different")),
  );
});

test("risk indicators escalate from reused sender to strong duplicate signals", () => {
  assert.deepEqual(
    assessPaymentRisk({
      previousUses: 0,
      recentUses: 0,
      hasRejectedSenderAttempt: false,
      hasDuplicateTransactionReference: false,
      hasDuplicateProof: false,
    }),
    { level: "none", reasons: [] },
  );
  assert.equal(
    assessPaymentRisk({
      previousUses: 1,
      recentUses: 1,
      hasRejectedSenderAttempt: false,
      hasDuplicateTransactionReference: false,
      hasDuplicateProof: false,
    }).level,
    "yellow",
  );
  assert.equal(
    assessPaymentRisk({
      previousUses: 2,
      recentUses: 2,
      hasRejectedSenderAttempt: false,
      hasDuplicateTransactionReference: false,
      hasDuplicateProof: false,
    }).level,
    "orange",
  );
  const red = assessPaymentRisk({
    previousUses: 1,
    recentUses: 1,
    hasRejectedSenderAttempt: true,
    hasDuplicateTransactionReference: true,
    hasDuplicateProof: true,
  });
  assert.equal(red.level, "red");
  assert.deepEqual(red.reasons, [
    "sender_reused",
    "sender_previously_rejected",
    "transaction_reference_duplicate",
    "proof_duplicate",
  ]);
});
