import { Router, type IRouter, type RequestHandler } from "express";
import multer from "multer";
import sharp from "sharp";
import {
  db,
  manualPaymentSettingsTable,
  ordersTable,
  paymentAttemptsTable,
  paymentSendersTable,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "@workspace/api-zod";
import { parseBody } from "../lib/validation";
import { rateLimit } from "../lib/rate-limit";
import { imageStorage } from "../services/storage";
import {
  amountsEqual,
  assessPaymentRisk,
  normalizePaymentSender,
  normalizeTransactionReference,
  paymentProofFingerprint,
} from "../services/manual-payments";

const router: IRouter = Router();
const submitRateLimit = rateLimit({ namespace: "payment-attempt", windowMs: 30 * 60_000, max: 10 });
const acceptedProofTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10 },
  fileFilter: (_req, file, callback) => acceptedProofTypes.has(file.mimetype) ? callback(null, true) : callback(new Error("INVALID_PAYMENT_PROOF_TYPE")),
});
const parseProof: RequestHandler = (req, res, next) => {
  proofUpload.single("proofImage")(req, res, error => {
    if (!error) { next(); return; }
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") { res.status(413).json({ error: "صورة التحويل أكبر من 5 ميجابايت" }); return; }
    res.status(400).json({ error: "صورة التحويل يجب أن تكون JPG أو JPEG أو PNG أو WEBP" });
  });
};

const attemptSchema = z.object({
  senderIdentifier: z.string().trim().min(3, "الرقم أو الحساب المحول منه مطلوب").max(200),
  amount: z.coerce.number().positive().max(10_000_000),
  transactionReference: z.preprocess(value => value === "" ? null : value, z.string().trim().max(200).nullable().optional()),
});

function canAccessOrder(req: Express.Request, order: typeof ordersTable.$inferSelect): boolean {
  return Boolean((req.session.customerId && order.customerId === req.session.customerId) || req.session.lastOrderNumber === order.orderNumber);
}

router.get("/payments/settings", async (_req, res) => {
  const rows = await db.select().from(manualPaymentSettingsTable)
    .where(eq(manualPaymentSettingsTable.isActive, true))
    .orderBy(manualPaymentSettingsTable.sortOrder, manualPaymentSettingsTable.id);
  res.setHeader("Cache-Control", "no-store");
  res.json(rows.map(row => ({
    method: row.method,
    displayNameAr: row.displayNameAr,
    transferDestination: row.transferDestination,
    accountHolderName: row.accountHolderName,
    instructionsAr: row.instructionsAr,
  })));
});

router.post("/orders/:orderNumber/payment-attempts", submitRateLimit, parseProof, async (req, res): Promise<void> => {
  const input = parseBody(attemptSchema, req.body, res); if (!input) return;
  const orderNumber = Array.isArray(req.params.orderNumber) ? req.params.orderNumber[0] : req.params.orderNumber;
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.orderNumber, orderNumber));
  if (!order || !canAccessOrder(req, order)) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
  if (order.paymentMethod !== "manual_transfer" || !order.paymentPlan || !order.transferMethod || order.requiredPaymentAmount == null) {
    res.status(409).json({ error: "هذا الطلب لا يستخدم نظام التحويل اليدوي" }); return;
  }
  if (["fully_paid", "partially_paid"].includes(order.paymentStatus)) {
    res.status(409).json({ error: "تم اعتماد دفعة هذا الطلب بالفعل" }); return;
  }
  if (!amountsEqual(input.amount, Number(order.requiredPaymentAmount))) {
    res.status(400).json({ error: `المبلغ المطلوب لهذا الطلب هو ${Number(order.requiredPaymentAmount).toFixed(2)} جنيه` }); return;
  }
  const [activeSetting] = await db.select({ id: manualPaymentSettingsTable.id }).from(manualPaymentSettingsTable)
    .where(and(eq(manualPaymentSettingsTable.method, order.transferMethod), eq(manualPaymentSettingsTable.isActive, true)));
  if (!activeSetting) { res.status(409).json({ error: "وسيلة التحويل المختارة غير متاحة حاليًا" }); return; }

  const senderNormalized = normalizePaymentSender(input.senderIdentifier);
  if (senderNormalized.length < 3) { res.status(400).json({ error: "الرقم أو الحساب المحول منه غير صحيح" }); return; }
  const referenceNormalized = normalizeTransactionReference(input.transactionReference);
  const fingerprint = req.file ? paymentProofFingerprint(req.file.buffer) : null;
  let stored: Awaited<ReturnType<typeof imageStorage.saveImage>> | null = null;
  try {
    if (req.file) {
      try {
        const metadata = await sharp(req.file.buffer, { failOn: "error", limitInputPixels: 40_000_000 }).metadata();
        if (!metadata.width || !metadata.height) throw new Error("INVALID_IMAGE");
      } catch {
        res.status(400).json({ error: "ملف إثبات التحويل ليس صورة صالحة" });
        return;
      }
      stored = await imageStorage.saveImage(req.file.buffer, "payment-proofs");
    }
    const created = await db.transaction(async tx => {
      await tx.execute(sql`select id from orders where id = ${order.id} for update`);
      const [lockedOrder] = await tx.select().from(ordersTable).where(eq(ordersTable.id, order.id));
      if (!lockedOrder || ["fully_paid", "partially_paid"].includes(lockedOrder.paymentStatus)) throw new Error("PAYMENT_ALREADY_REVIEWED");
      if (!lockedOrder.paymentPlan || !lockedOrder.transferMethod) throw new Error("INVALID_MANUAL_PAYMENT_ORDER");
      const [openAttempt] = await tx.select({ id: paymentAttemptsTable.id }).from(paymentAttemptsTable)
        .where(and(eq(paymentAttemptsTable.orderId, order.id), sql`${paymentAttemptsTable.status} in ('pending_verification', 'needs_review')`)).limit(1);
      if (openAttempt) throw new Error("OPEN_PAYMENT_ATTEMPT");

      const now = new Date();
      const [sender] = await tx.insert(paymentSendersTable).values({
        normalizedIdentifier: senderNormalized,
        latestOriginalIdentifier: input.senderIdentifier,
        usageCount: 1,
        firstUsedAt: now,
        lastUsedAt: now,
      }).onConflictDoUpdate({
        target: paymentSendersTable.normalizedIdentifier,
        set: {
          latestOriginalIdentifier: input.senderIdentifier,
          usageCount: sql`${paymentSendersTable.usageCount} + 1`,
          lastUsedAt: now,
        },
      }).returning();

      const recentThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
      // A PostgreSQL transaction owns one client. Keep its queries sequential so
      // concurrent client.query calls cannot interleave on pg 8 or fail on pg 9.
      const [historyStats] = await tx.select({ count: sql<number>`count(*)::int`, recent: sql<number>`count(*) filter (where ${paymentAttemptsTable.createdAt} >= ${recentThreshold})::int` })
        .from(paymentAttemptsTable).where(eq(paymentAttemptsTable.senderId, sender.id));
      const [rejected] = await tx.select({ id: paymentAttemptsTable.id }).from(paymentAttemptsTable)
        .where(and(eq(paymentAttemptsTable.senderId, sender.id), eq(paymentAttemptsTable.status, "rejected"))).limit(1);
      const [duplicateReference] = referenceNormalized
        ? await tx.select({ id: paymentAttemptsTable.id }).from(paymentAttemptsTable)
          .where(eq(paymentAttemptsTable.transactionReferenceNormalized, referenceNormalized)).limit(1)
        : [];
      const [duplicateProof] = fingerprint
        ? await tx.select({ id: paymentAttemptsTable.id }).from(paymentAttemptsTable)
          .where(eq(paymentAttemptsTable.proofFingerprint, fingerprint)).limit(1)
        : [];
      const risk = assessPaymentRisk({
        previousUses: historyStats.count,
        recentUses: historyStats.recent,
        hasRejectedSenderAttempt: Boolean(rejected),
        hasDuplicateTransactionReference: Boolean(duplicateReference),
        hasDuplicateProof: Boolean(duplicateProof),
      });
      const [attempt] = await tx.insert(paymentAttemptsTable).values({
        orderId: order.id,
        senderId: sender.id,
        paymentPlan: lockedOrder.paymentPlan,
        transferMethod: lockedOrder.transferMethod,
        amount: String(input.amount),
        senderIdentifierOriginal: input.senderIdentifier,
        senderIdentifierNormalized: senderNormalized,
        transactionReferenceOriginal: input.transactionReference || null,
        transactionReferenceNormalized: referenceNormalized,
        proofImageUrl: stored?.url ?? null,
        proofStorageKey: stored?.storageKey ?? null,
        proofMimeType: stored?.mimeType ?? null,
        proofSizeBytes: stored?.size ?? null,
        proofFingerprint: fingerprint,
        status: "pending_verification",
        riskLevel: risk.level,
        riskReasons: risk.reasons,
      }).returning();
      await tx.update(ordersTable).set({ paymentStatus: "pending_verification" }).where(eq(ordersTable.id, order.id));
      return { attempt, previousUseCount: historyStats.count, risk };
    });
    res.status(201).json({
      id: created.attempt.id,
      status: created.attempt.status,
      statusLabel: "في انتظار مراجعة التحويل",
      amount: Number(created.attempt.amount),
      riskLevel: created.risk.level,
      previousUseCount: created.previousUseCount,
      hasProof: Boolean(created.attempt.proofImageUrl),
      createdAt: created.attempt.createdAt,
    });
  } catch (error) {
    if (stored) await imageStorage.deleteImage(stored.storageKey).catch(() => undefined);
    if (error instanceof Error && error.message === "OPEN_PAYMENT_ATTEMPT") { res.status(409).json({ error: "يوجد تحويل قيد المراجعة لهذا الطلب بالفعل" }); return; }
    if (error instanceof Error && error.message === "PAYMENT_ALREADY_REVIEWED") { res.status(409).json({ error: "تم اعتماد دفعة هذا الطلب بالفعل" }); return; }
    if (error instanceof Error && error.message === "INVALID_MANUAL_PAYMENT_ORDER") { res.status(409).json({ error: "بيانات الدفع الخاصة بالطلب غير مكتملة" }); return; }
    throw error;
  }
});

router.get("/orders/:orderNumber/payment-attempts", async (req, res): Promise<void> => {
  const orderNumber = Array.isArray(req.params.orderNumber) ? req.params.orderNumber[0] : req.params.orderNumber;
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.orderNumber, orderNumber));
  if (!order || !canAccessOrder(req, order)) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
  const attempts = await db.select().from(paymentAttemptsTable).where(eq(paymentAttemptsTable.orderId, order.id)).orderBy(desc(paymentAttemptsTable.createdAt));
  res.json(attempts.map(attempt => ({
    id: attempt.id,
    amount: Number(attempt.amount),
    transferMethod: attempt.transferMethod,
    status: attempt.status,
    rejectionReason: attempt.rejectionReason,
    hasProof: Boolean(attempt.proofImageUrl),
    createdAt: attempt.createdAt,
    reviewedAt: attempt.reviewedAt,
  })));
});

export default router;
