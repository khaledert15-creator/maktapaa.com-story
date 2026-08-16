import { createHash } from "node:crypto";
import {
  auditLogsTable,
  db,
  ordersTable,
  paymentAttemptsTable,
  paymentReviewHistoryTable,
  usersTable,
} from "@workspace/db";
import { normalizeEgyptianPhone } from "@workspace/api-zod";
import { and, eq, ne, sql } from "drizzle-orm";

export type ManualPaymentPlan = "deposit_100" | "full";
export type PaymentAttemptDecision = "confirmed" | "rejected" | "needs_review";
export type PaymentRiskLevel = "none" | "yellow" | "orange" | "red";

const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
const persianDigits = "۰۱۲۳۴۵۶۷۸۹";

export function toEnglishDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, digit => {
    const arabicIndex = arabicDigits.indexOf(digit);
    return String(arabicIndex >= 0 ? arabicIndex : persianDigits.indexOf(digit));
  });
}

export function normalizePaymentSender(value: string): string {
  const normalized = toEnglishDigits(value).normalize("NFKC").trim();
  const phone = normalizeEgyptianPhone(normalized);
  if (phone) return phone;
  return normalized.toLocaleLowerCase("en-US").replace(/\s+/g, "");
}

export function normalizeTransactionReference(value: string | null | undefined): string | null {
  const normalized = toEnglishDigits(value ?? "").normalize("NFKC").trim().toLocaleUpperCase("en-US").replace(/[^\p{L}\p{N}]/gu, "");
  return normalized || null;
}

export function paymentProofFingerprint(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function calculateRequiredPayment(total: number, plan: ManualPaymentPlan): number {
  const safeTotal = Math.max(0, Math.round(total * 100) / 100);
  return plan === "full" ? safeTotal : Math.min(100, safeTotal);
}

export function amountsEqual(left: number, right: number): boolean {
  return Math.round(left * 100) === Math.round(right * 100);
}

export function assessPaymentRisk(input: {
  previousUses: number;
  recentUses: number;
  hasRejectedSenderAttempt: boolean;
  hasDuplicateTransactionReference: boolean;
  hasDuplicateProof: boolean;
}): { level: PaymentRiskLevel; reasons: string[] } {
  const reasons: string[] = [];
  if (input.previousUses > 0) reasons.push("sender_reused");
  if (input.recentUses >= 2) reasons.push("sender_frequent");
  if (input.hasRejectedSenderAttempt) reasons.push("sender_previously_rejected");
  if (input.hasDuplicateTransactionReference) reasons.push("transaction_reference_duplicate");
  if (input.hasDuplicateProof) reasons.push("proof_duplicate");
  if (input.hasRejectedSenderAttempt || input.hasDuplicateTransactionReference || input.hasDuplicateProof) return { level: "red", reasons };
  if (input.recentUses >= 2) return { level: "orange", reasons };
  if (input.previousUses > 0) return { level: "yellow", reasons };
  return { level: "none", reasons };
}

export class PaymentReviewError extends Error {
  constructor(public readonly code: "NOT_FOUND" | "INVALID_STATE" | "DUPLICATE_REFERENCE" | "OVERRIDE_REASON_REQUIRED", message: string) {
    super(message);
  }
}

export async function reviewPaymentAttempt(input: {
  attemptId: number;
  decision: PaymentAttemptDecision;
  notes?: string | null;
  rejectionReason?: string | null;
  overrideDuplicateReference?: boolean;
  employeeId: number;
  ipAddress?: string | null;
}) {
  return db.transaction(async tx => {
    await tx.execute(sql`select id from payment_attempts where id = ${input.attemptId} for update`);
    const [attempt] = await tx.select().from(paymentAttemptsTable).where(eq(paymentAttemptsTable.id, input.attemptId));
    if (!attempt) throw new PaymentReviewError("NOT_FOUND", "بيانات التحويل غير موجودة");
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, attempt.orderId));
    if (!order) throw new PaymentReviewError("NOT_FOUND", "الطلب المرتبط بالتحويل غير موجود");
    const [employee] = await tx.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, input.employeeId));

    if (attempt.status === "confirmed" && input.decision === "confirmed") {
      return { attempt, order, idempotent: true };
    }
    if (attempt.status === "rejected" || attempt.status === "confirmed") {
      throw new PaymentReviewError("INVALID_STATE", "تم اتخاذ قرار نهائي على هذا التحويل بالفعل");
    }
    if (input.decision === "rejected" && !input.rejectionReason?.trim()) {
      throw new PaymentReviewError("INVALID_STATE", "سبب رفض التحويل مطلوب");
    }

    if (input.decision === "confirmed" && attempt.transactionReferenceNormalized) {
      // Serialize confirmations for the same reference even when they belong to
      // different orders, otherwise two concurrent reviewers could both see no
      // confirmed duplicate before either transaction commits.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${attempt.transactionReferenceNormalized}, 0))`);
      const [duplicate] = await tx.select({ id: paymentAttemptsTable.id, orderId: paymentAttemptsTable.orderId })
        .from(paymentAttemptsTable)
        .where(and(
          eq(paymentAttemptsTable.transactionReferenceNormalized, attempt.transactionReferenceNormalized),
          eq(paymentAttemptsTable.status, "confirmed"),
          ne(paymentAttemptsTable.id, attempt.id),
        )).limit(1);
      if (duplicate && !input.overrideDuplicateReference) {
        throw new PaymentReviewError("DUPLICATE_REFERENCE", "رقم العملية مؤكد بالفعل على طلب آخر. يلزم Override إداري مسجل.");
      }
      if (duplicate && input.overrideDuplicateReference && !input.notes?.trim()) {
        throw new PaymentReviewError("OVERRIDE_REASON_REQUIRED", "اكتب سبب التجاوز الإداري لرقم العملية المكرر");
      }
    }

    const reviewedAt = new Date();
    const [updatedAttempt] = await tx.update(paymentAttemptsTable).set({
      status: input.decision,
      reviewerId: input.employeeId,
      reviewerName: employee?.name ?? null,
      rejectionReason: input.decision === "rejected" ? input.rejectionReason!.trim() : null,
      reviewNotes: input.notes?.trim() || null,
      reviewedAt,
    }).where(eq(paymentAttemptsTable.id, attempt.id)).returning();

    let paymentStatus: typeof ordersTable.$inferSelect["paymentStatus"];
    let paidAmount = Number(order.paidAmount);
    let remainingAmount = order.remainingAmount == null ? Number(order.total) : Number(order.remainingAmount);
    if (input.decision === "confirmed") {
      const [confirmed] = await tx.select({ total: sql<string>`coalesce(sum(${paymentAttemptsTable.amount}::numeric), 0)::text` })
        .from(paymentAttemptsTable)
        .where(and(eq(paymentAttemptsTable.orderId, order.id), eq(paymentAttemptsTable.status, "confirmed")));
      paidAmount = Math.min(Number(order.total), Number(confirmed.total));
      remainingAmount = Math.max(0, Number(order.total) - paidAmount);
      paymentStatus = remainingAmount === 0 ? "fully_paid" : "partially_paid";
    } else {
      paymentStatus = input.decision === "rejected" ? "rejected" : "needs_review";
    }
    const [updatedOrder] = await tx.update(ordersTable).set({
      paymentStatus,
      paidAmount: String(paidAmount),
      remainingAmount: String(remainingAmount),
    }).where(eq(ordersTable.id, order.id)).returning();

    await tx.insert(paymentReviewHistoryTable).values({
      attemptId: attempt.id,
      orderId: order.id,
      fromStatus: attempt.status,
      toStatus: input.decision,
      employeeId: input.employeeId,
      employeeName: employee?.name ?? null,
      notes: input.decision === "rejected" ? input.rejectionReason!.trim() : input.notes?.trim() || null,
      overrideDuplicateReference: Boolean(input.overrideDuplicateReference),
    });
    await tx.insert(auditLogsTable).values({
      employeeId: input.employeeId,
      employeeName: employee?.name ?? null,
      action: input.decision === "confirmed" ? "payment.confirm" : input.decision === "rejected" ? "payment.reject" : "payment.needs_review",
      entityType: "payment_attempt",
      entityId: String(attempt.id),
      description: `${employee?.name ?? "موظف"} ${input.decision === "confirmed" ? "أكد" : input.decision === "rejected" ? "رفض" : "طلب مراجعة"} تحويل الطلب ${order.orderNumber}`,
      beforeData: { status: attempt.status, orderPaymentStatus: order.paymentStatus },
      afterData: { status: input.decision, orderPaymentStatus: paymentStatus, amount: Number(attempt.amount), paidAmount, remainingAmount, overrideDuplicateReference: Boolean(input.overrideDuplicateReference) },
      ipAddress: input.ipAddress ?? null,
    });
    return { attempt: updatedAttempt, order: updatedOrder, idempotent: false };
  });
}
