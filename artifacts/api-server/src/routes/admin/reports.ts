import { Router, type IRouter } from "express";
import { customersTable, db, ordersTable, productsTable } from "@workspace/db";
import { gte, lt, and, eq, sql } from "drizzle-orm";
import { requireAdminAuth, requireAdminPermission } from "../../lib/auth";
import { z } from "@workspace/api-zod";

const router: IRouter = Router();
router.use(requireAdminAuth);

router.get("/admin/reports/sales", requireAdminPermission("reports.view"), async (req, res): Promise<void> => {
  const parsed = z.object({ dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "نطاق التاريخ غير صحيح" }); return; }
  const { dateFrom, dateTo } = parsed.data;
  const from = new Date(`${dateFrom}T00:00:00.000Z`);
  const toExclusive = new Date(`${dateTo}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  if (from >= toExclusive) { res.status(400).json({ error: "تاريخ البداية يجب ألا يلي تاريخ النهاية" }); return; }
  const range = and(gte(ordersTable.createdAt, from), lt(ordersTable.createdAt, toExclusive));

  const [summary] = await db.select({
    grossRevenue: sql<number>`coalesce(sum(${ordersTable.total}::numeric), 0)`,
    totalRevenue: sql<number>`coalesce(sum(case when ${ordersTable.status} not in ('cancelled', 'returned') then ${ordersTable.total}::numeric else 0 end), 0)`,
    shippingRevenue: sql<number>`coalesce(sum(case when ${ordersTable.status} not in ('cancelled', 'returned') then ${ordersTable.shippingCost}::numeric else 0 end), 0)`,
    totalOrders: sql<number>`count(*)::int`,
    cancelledOrders: sql<number>`count(*) filter (where ${ordersTable.status} = 'cancelled')::int`,
    avgOrderValue: sql<number>`coalesce(avg(case when ${ordersTable.status} not in ('cancelled', 'returned') then ${ordersTable.total}::numeric end), 0)`,
  }).from(ordersTable).where(range);

  const data = await db.select({
    date: sql<string>`date(created_at)`,
    amount: sql<number>`coalesce(sum(case when ${ordersTable.status} not in ('cancelled', 'returned') then ${ordersTable.total}::numeric else 0 end), 0)`,
    shipping: sql<number>`coalesce(sum(case when ${ordersTable.status} not in ('cancelled', 'returned') then ${ordersTable.shippingCost}::numeric else 0 end), 0)`,
    orderCount: sql<number>`count(*)::int`,
    cancelledCount: sql<number>`count(*) filter (where ${ordersTable.status} = 'cancelled')::int`,
  }).from(ordersTable)
    .where(range)
    .groupBy(sql`date(created_at)`)
    .orderBy(sql`date(created_at)`);

  const [statuses, [{ newCustomers }]] = await Promise.all([
    db.select({ status: ordersTable.status, count: sql<number>`count(*)::int` }).from(ordersTable).where(range).groupBy(ordersTable.status),
    db.select({ newCustomers: sql<number>`count(*)::int` }).from(customersTable).where(and(gte(customersTable.createdAt, from), lt(customersTable.createdAt, toExclusive))),
  ]);

  res.json({
    dateFrom, dateTo,
    grossRevenue: Number(summary.grossRevenue),
    totalRevenue: Number(summary.totalRevenue),
    shippingRevenue: Number(summary.shippingRevenue),
    totalOrders: summary.totalOrders,
    cancelledOrders: summary.cancelledOrders,
    newCustomers,
    avgOrderValue: Number(summary.avgOrderValue),
    statuses,
    data: data.map(d => ({ date: d.date, amount: Number(d.amount), shipping: Number(d.shipping), orderCount: d.orderCount, cancelledCount: d.cancelledCount })),
  });
});

router.get("/admin/reports/inventory", requireAdminPermission("reports.view"), async (_req, res): Promise<void> => {
  const [{ totalProducts }] = await db.select({ totalProducts: sql<number>`count(*)::int` }).from(productsTable).where(eq(productsTable.status, "active"));
  const [{ inStockCount }] = await db.select({ inStockCount: sql<number>`count(*)::int` }).from(productsTable).where(and(eq(productsTable.status, "active"), sql`${productsTable.stockQuantity} > ${productsTable.minStockLevel}` as ReturnType<typeof eq>));
  const [{ lowStockCount }] = await db.select({ lowStockCount: sql<number>`count(*)::int` }).from(productsTable).where(and(eq(productsTable.status, "active"), sql`${productsTable.stockQuantity} > 0 AND ${productsTable.stockQuantity} <= ${productsTable.minStockLevel}` as ReturnType<typeof eq>));
  const [{ outOfStockCount }] = await db.select({ outOfStockCount: sql<number>`count(*)::int` }).from(productsTable).where(and(eq(productsTable.status, "active"), eq(productsTable.stockQuantity, 0)));
  const [{ totalValue }] = await db.select({ totalValue: sql<number>`coalesce(sum(price::numeric * stock_quantity), 0)` }).from(productsTable).where(eq(productsTable.status, "active"));

  res.json({ totalProducts, inStockCount, lowStockCount, outOfStockCount, totalInventoryValue: Number(totalValue) });
});

export default router;
