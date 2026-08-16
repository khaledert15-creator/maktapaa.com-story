import { Router, type IRouter } from "express";
import { db, productsTable, reviewsTable } from "@workspace/db";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "@workspace/api-zod";
import { requireAdminAuth, requireAdminPermission } from "../../lib/auth";
import { parseBody } from "../../lib/validation";
import { writeAuditLog } from "../../services/audit";

const router: IRouter = Router();
router.use(requireAdminAuth);

const moderationSchema = z.object({ moderationStatus: z.enum(["approved", "rejected"]) });
const statusSchema = z.enum(["all", "pending", "approved", "rejected"]);

router.get("/admin/reviews", requireAdminPermission("products.view"), async (req, res): Promise<void> => {
  const statusResult = statusSchema.safeParse(req.query.status ?? "pending");
  if (!statusResult.success) { res.status(400).json({ error: "حالة التقييم غير صحيحة" }); return; }
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const filters = [
    statusResult.data === "all" ? undefined : eq(reviewsTable.moderationStatus, statusResult.data),
    q ? or(ilike(productsTable.nameAr, `%${q}%`), ilike(reviewsTable.customerName, `%${q}%`), ilike(reviewsTable.comment, `%${q}%`)) : undefined,
  ].filter(Boolean);
  const where = filters.length ? and(...filters) : undefined;

  const [items, [{ count }]] = await Promise.all([
    db.select({
      id: reviewsTable.id,
      productId: reviewsTable.productId,
      productName: productsTable.nameAr,
      productSlug: productsTable.slug,
      customerId: reviewsTable.customerId,
      customerName: reviewsTable.customerName,
      rating: reviewsTable.rating,
      comment: reviewsTable.comment,
      moderationStatus: reviewsTable.moderationStatus,
      verifiedPurchase: reviewsTable.verifiedPurchase,
      createdAt: reviewsTable.createdAt,
    }).from(reviewsTable).innerJoin(productsTable, eq(productsTable.id, reviewsTable.productId))
      .where(where).orderBy(desc(reviewsTable.createdAt)).limit(limit).offset((page - 1) * limit),
    db.select({ count: sql<number>`count(*)::int` }).from(reviewsTable)
      .innerJoin(productsTable, eq(productsTable.id, reviewsTable.productId)).where(where),
  ]);

  res.json({ items, total: count, page, limit });
});

router.patch("/admin/reviews/:id", requireAdminPermission("products.edit"), async (req, res): Promise<void> => {
  const input = parseBody(moderationSchema, req.body, res); if (!input) return;
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isInteger(id) || id < 1) { res.status(400).json({ error: "رقم التقييم غير صحيح" }); return; }
  const [before] = await db.select().from(reviewsTable).where(eq(reviewsTable.id, id));
  if (!before) { res.status(404).json({ error: "التقييم غير موجود" }); return; }
  const [review] = await db.update(reviewsTable).set({
    moderationStatus: input.moderationStatus,
    isApproved: input.moderationStatus === "approved" ? 1 : 0,
  }).where(eq(reviewsTable.id, id)).returning();
  await writeAuditLog(req, {
    action: `review.${input.moderationStatus}`,
    entityType: "review",
    entityId: id,
    description: `${input.moderationStatus === "approved" ? "اعتماد" : "رفض"} تقييم ${review.customerName}`,
    beforeData: before,
    afterData: review,
  });
  res.json(review);
});

export default router;
