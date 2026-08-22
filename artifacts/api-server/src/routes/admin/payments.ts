import { Router, type IRouter } from "express";
import {
  db,
  manualPaymentSettingsTable,
  ordersTable,
  paymentAttemptsTable,
  paymentReviewHistoryTable,
  paymentSendersTable,
} from "@workspace/db";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "@workspace/api-zod";
import { hasAdminPermission, requireAdminAuth, requireAdminPermission } from "../../lib/auth";
import { parseBody } from "../../lib/validation";
import { writeAuditLog } from "../../services/audit";
import { normalizePaymentSender, normalizeTransactionReference, PaymentReviewError, reviewPaymentAttempt } from "../../services/manual-payments";

const router: IRouter = Router();
router.use(requireAdminAuth);

const queryStatus = z.enum(["all", "pending_verification", "confirmed", "rejected", "needs_review"]);
const queryPlan = z.enum(["all", "deposit_100", "full"]);
const queryMethod = z.enum(["all", "instapay", "mobile_wallet"]);
const reviewSchema = z.object({
  decision: z.enum(["confirmed", "rejected", "needs_review"]),
  notes: z.string().trim().max(2000).nullable().optional(),
  rejectionReason: z.string().trim().max(2000).nullable().optional(),
  overrideDuplicateReference: z.boolean().default(false),
});
const settingSchema = z.object({
  method: z.enum(["instapay", "mobile_wallet"]),
  displayNameAr: z.string().trim().min(2).max(100),
  transferDestination: z.string().trim().min(3).max(300),
  accountHolderName: z.string().trim().max(200).nullable().optional(),
  instructionsAr: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(100),
});

function mapPaymentRow(row: {
  attempt: typeof paymentAttemptsTable.$inferSelect;
  order: typeof ordersTable.$inferSelect;
  sender: typeof paymentSendersTable.$inferSelect;
}) {
  return {
    id: row.attempt.id,
    orderId: row.order.id,
    orderNumber: row.order.orderNumber,
    customerName: row.order.customerName,
    customerPhone: row.order.mobile,
    orderTotal: Number(row.order.total),
    paymentPlan: row.attempt.paymentPlan,
    amount: Number(row.attempt.amount),
    paidAmount: Number(row.order.paidAmount),
    remainingAmount: Number(row.order.remainingAmount ?? row.order.total),
    transferMethod: row.attempt.transferMethod,
    senderIdentifier: row.attempt.senderIdentifierOriginal,
    senderIdentifierNormalized: row.attempt.senderIdentifierNormalized,
    transactionReference: row.attempt.transactionReferenceOriginal,
    proofImageUrl: row.attempt.proofImageUrl,
    status: row.attempt.status,
    riskLevel: row.attempt.riskLevel,
    riskReasons: row.attempt.riskReasons,
    previousUseCount: Math.max(0, row.sender.usageCount - 1),
    lastSenderUseAt: row.sender.lastUsedAt,
    reviewerName: row.attempt.reviewerName,
    rejectionReason: row.attempt.rejectionReason,
    reviewNotes: row.attempt.reviewNotes,
    reviewedAt: row.attempt.reviewedAt,
    createdAt: row.attempt.createdAt,
  };
}

router.get("/admin/payments/pending-count", requireAdminPermission("payments.view"), async (_req, res) => {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(paymentAttemptsTable)
    .where(sql`${paymentAttemptsTable.status} in ('pending_verification', 'needs_review')`);
  res.json({ count });
});

router.get("/admin/payments/settings", requireAdminPermission("payments.view"), async (_req, res) => {
  res.json(await db.select().from(manualPaymentSettingsTable).orderBy(manualPaymentSettingsTable.sortOrder, manualPaymentSettingsTable.id));
});

router.put("/admin/payments/settings/:method", requireAdminPermission("payments.settings"), async (req, res): Promise<void> => {
  const input = parseBody(settingSchema, req.body, res); if (!input) return;
  const method = Array.isArray(req.params.method) ? req.params.method[0] : req.params.method;
  if (input.method !== method) { res.status(400).json({ error: "وسيلة التحويل لا تطابق الرابط" }); return; }
  const [before] = await db.select().from(manualPaymentSettingsTable).where(eq(manualPaymentSettingsTable.method, input.method));
  const [setting] = await db.insert(manualPaymentSettingsTable).values(input).onConflictDoUpdate({
    target: manualPaymentSettingsTable.method,
    set: { ...input, updatedAt: new Date() },
  }).returning();
  await writeAuditLog(req, { action: "payment.settings_update", entityType: "payment_setting", entityId: input.method, description: `تعديل بيانات تحويل ${input.displayNameAr}`, beforeData: before ?? null, afterData: setting });
  res.json(setting);
});

router.get("/admin/payments", requireAdminPermission("payments.view"), async (req, res): Promise<void> => {
  const statusResult = queryStatus.safeParse(req.query.status ?? "pending_verification");
  const planResult = queryPlan.safeParse(req.query.plan ?? "all");
  const methodResult = queryMethod.safeParse(req.query.method ?? "all");
  if (!statusResult.success || !planResult.success || !methodResult.success) { res.status(400).json({ error: "فلاتر المدفوعات غير صحيحة" }); return; }
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const hasRisk = req.query.hasRisk === "true";
  const conditions: SQL[] = [];
  if (statusResult.data !== "all") conditions.push(eq(paymentAttemptsTable.status, statusResult.data));
  if (planResult.data !== "all") conditions.push(eq(paymentAttemptsTable.paymentPlan, planResult.data));
  if (methodResult.data !== "all") conditions.push(eq(paymentAttemptsTable.transferMethod, methodResult.data));
  if (hasRisk) conditions.push(sql`${paymentAttemptsTable.riskLevel} <> 'none'`);
  if (q) {
    const normalizedSender = normalizePaymentSender(q);
    const normalizedReference = normalizeTransactionReference(q);
    conditions.push(or(
      ilike(ordersTable.orderNumber, `%${q}%`),
      ilike(ordersTable.customerName, `%${q}%`),
      ilike(ordersTable.mobile, `%${normalizedSender}%`),
      ilike(paymentAttemptsTable.senderIdentifierOriginal, `%${q}%`),
      ilike(paymentAttemptsTable.senderIdentifierNormalized, `%${normalizedSender}%`),
      normalizedReference ? ilike(paymentAttemptsTable.transactionReferenceNormalized, `%${normalizedReference}%`) : undefined,
      sql`${paymentAttemptsTable.amount}::text ilike ${`%${normalizePaymentSender(q)}%`}`,
    )!);
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const base = db.select({ attempt: paymentAttemptsTable, order: ordersTable, sender: paymentSendersTable })
    .from(paymentAttemptsTable)
    .innerJoin(ordersTable, eq(ordersTable.id, paymentAttemptsTable.orderId))
    .innerJoin(paymentSendersTable, eq(paymentSendersTable.id, paymentAttemptsTable.senderId));
  const countBase = db.select({ count: sql<number>`count(*)::int` }).from(paymentAttemptsTable)
    .innerJoin(ordersTable, eq(ordersTable.id, paymentAttemptsTable.orderId))
    .innerJoin(paymentSendersTable, eq(paymentSendersTable.id, paymentAttemptsTable.senderId));
  const [rows, [{ count }]] = await Promise.all([
    base.where(where).orderBy(desc(paymentAttemptsTable.createdAt)).limit(limit).offset((page - 1) * limit),
    countBase.where(where),
  ]);
  res.json({ items: rows.map(mapPaymentRow), total: count, page, limit });
});

router.get("/admin/payments/:id", requireAdminPermission("payments.view"), async (req, res): Promise<void> => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isInteger(id) || id < 1) { res.status(400).json({ error: "رقم التحويل غير صحيح" }); return; }
  const [row] = await db.select({ attempt: paymentAttemptsTable, order: ordersTable, sender: paymentSendersTable })
    .from(paymentAttemptsTable)
    .innerJoin(ordersTable, eq(ordersTable.id, paymentAttemptsTable.orderId))
    .innerJoin(paymentSendersTable, eq(paymentSendersTable.id, paymentAttemptsTable.senderId))
    .where(eq(paymentAttemptsTable.id, id));
  if (!row) { res.status(404).json({ error: "بيانات التحويل غير موجودة" }); return; }
  const historyAllowed = hasAdminPermission(req, "payments.history");
  const [reviewHistory, senderRows] = await Promise.all([
    db.select().from(paymentReviewHistoryTable).where(eq(paymentReviewHistoryTable.attemptId, id)).orderBy(desc(paymentReviewHistoryTable.createdAt)),
    historyAllowed ? db.select({ attempt: paymentAttemptsTable, order: ordersTable })
      .from(paymentAttemptsTable).innerJoin(ordersTable, eq(ordersTable.id, paymentAttemptsTable.orderId))
      .where(eq(paymentAttemptsTable.senderId, row.sender.id)).orderBy(desc(paymentAttemptsTable.createdAt)).limit(50) : Promise.resolve([]),
  ]);
  res.json({
    ...mapPaymentRow(row),
    reviewHistory,
    senderHistory: senderRows.map(item => ({
      id: item.attempt.id,
      createdAt: item.attempt.createdAt,
      orderNumber: item.order.orderNumber,
      customerName: item.order.customerName,
      amount: Number(item.attempt.amount),
      transferMethod: item.attempt.transferMethod,
      transactionReference: item.attempt.transactionReferenceOriginal,
      status: item.attempt.status,
      reviewerName: item.attempt.reviewerName,
      rejectionReason: item.attempt.rejectionReason,
    })),
  });
});

router.patch("/admin/payments/:id/review", requireAdminPermission("payments.review"), async (req, res): Promise<void> => {
  const input = parseBody(reviewSchema, req.body, res); if (!input) return;
  if (input.decision === "confirmed" && !hasAdminPermission(req, "payments.confirm")) { res.status(403).json({ error: "ليس لديك صلاحية تأكيد المدفوعات" }); return; }
  if (input.decision === "rejected" && !hasAdminPermission(req, "payments.reject")) { res.status(403).json({ error: "ليس لديك صلاحية رفض المدفوعات" }); return; }
  if (input.overrideDuplicateReference && !hasAdminPermission(req, "payments.override")) { res.status(403).json({ error: "ليس لديك صلاحية التجاوز الإداري" }); return; }
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  try {
    const result = await reviewPaymentAttempt({
      attemptId: id,
      decision: input.decision,
      notes: input.notes,
      rejectionReason: input.rejectionReason,
      overrideDuplicateReference: input.overrideDuplicateReference,
      employeeId: req.session.adminId!,
      ipAddress: req.ip,
    });
    res.json({
      attempt: { ...result.attempt, amount: Number(result.attempt.amount) },
      order: { orderNumber: result.order.orderNumber, paymentStatus: result.order.paymentStatus, paidAmount: Number(result.order.paidAmount), remainingAmount: Number(result.order.remainingAmount ?? result.order.total) },
      idempotent: result.idempotent,
    });
  } catch (error) {
    if (error instanceof PaymentReviewError) {
      const status = error.code === "NOT_FOUND" ? 404 : 409;
      res.status(status).json({ error: error.message, code: error.code }); return;
    }
    throw error;
  }
});

export default router;
