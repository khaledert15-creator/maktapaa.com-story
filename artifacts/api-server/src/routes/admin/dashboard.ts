import { Router, type IRouter } from "express";
import { db, ordersTable, paymentAttemptsTable, productsTable, customersTable } from "@workspace/db";
import { eq, gte, sql, and } from "drizzle-orm";
import { hasAdminPermission, requireAdminAuth, requireAdminPermission } from "../../lib/auth";

const router: IRouter = Router();
router.use(requireAdminAuth);

router.get("/admin/dashboard/summary", requireAdminPermission("dashboard.view"), async (req, res): Promise<void> => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [[orderStats], [productStats], [{ totalCustomers }], [{ pendingPaymentCount }]] = await Promise.all([
    db.select({
      salesToday: sql<number>`coalesce(sum(${ordersTable.total}::numeric) filter (where ${ordersTable.status} = 'delivered' and ${ordersTable.createdAt} >= ${todayStart}), 0)`,
      salesWeek: sql<number>`coalesce(sum(${ordersTable.total}::numeric) filter (where ${ordersTable.status} = 'delivered' and ${ordersTable.createdAt} >= ${weekStart}), 0)`,
      salesMonth: sql<number>`coalesce(sum(${ordersTable.total}::numeric) filter (where ${ordersTable.status} = 'delivered' and ${ordersTable.createdAt} >= ${monthStart}), 0)`,
      totalOrders: sql<number>`count(*)::int`,
      newOrders: sql<number>`count(*) filter (where ${ordersTable.status} = 'new')::int`,
      pendingOrders: sql<number>`count(*) filter (where ${ordersTable.status} = 'awaiting_confirmation')::int`,
      preparingOrders: sql<number>`count(*) filter (where ${ordersTable.status} = 'preparing')::int`,
      shippedOrders: sql<number>`count(*) filter (where ${ordersTable.status} = 'shipped')::int`,
      deliveredOrders: sql<number>`count(*) filter (where ${ordersTable.status} = 'delivered')::int`,
      cancelledOrders: sql<number>`count(*) filter (where ${ordersTable.status} = 'cancelled')::int`,
      returnedOrders: sql<number>`count(*) filter (where ${ordersTable.status} = 'returned')::int`,
      avgOrderValue: sql<number>`coalesce(avg(${ordersTable.total}::numeric), 0)`,
    }).from(ordersTable),
    db.select({
      lowStockCount: sql<number>`count(*) filter (where ${productsTable.status} = 'active' and ${productsTable.stockQuantity} > 0 and ${productsTable.stockQuantity} <= ${productsTable.minStockLevel})::int`,
      outOfStockCount: sql<number>`count(*) filter (where ${productsTable.status} = 'active' and ${productsTable.stockQuantity} = 0)::int`,
    }).from(productsTable),
    db.select({ totalCustomers: sql<number>`count(*)::int` }).from(customersTable),
    db.select({ pendingPaymentCount: sql<number>`count(*) filter (where ${paymentAttemptsTable.status} in ('pending_verification', 'needs_review'))::int` }).from(paymentAttemptsTable),
  ]);

  res.json({
    salesToday: Number(orderStats.salesToday), salesThisWeek: Number(orderStats.salesWeek), salesThisMonth: Number(orderStats.salesMonth),
    totalOrders: orderStats.totalOrders, newOrders: orderStats.newOrders, pendingOrders: orderStats.pendingOrders,
    preparingOrders: orderStats.preparingOrders, shippedOrders: orderStats.shippedOrders, deliveredOrders: orderStats.deliveredOrders,
    cancelledOrders: orderStats.cancelledOrders, returnedOrders: orderStats.returnedOrders,
    lowStockCount: productStats.lowStockCount, outOfStockCount: productStats.outOfStockCount,
    avgOrderValue: Number(orderStats.avgOrderValue), totalCustomers, pendingPaymentCount: hasAdminPermission(req, "payments.view") ? pendingPaymentCount : 0,
  });
});

router.get("/admin/dashboard/sales-chart", requireAdminPermission("dashboard.view"), async (req, res): Promise<void> => {
  const { period = "30d" } = req.query as { period: string };
  const days = period === "7d" ? 7 : period === "90d" ? 90 : period === "365d" ? 365 : 30;
  const start = new Date();
  start.setDate(start.getDate() - days);

  const rows = await db.select({
    date: sql<string>`date(created_at)`,
    amount: sql<number>`coalesce(sum(total::numeric), 0)`,
    orderCount: sql<number>`count(*)::int`,
  }).from(ordersTable)
    .where(gte(ordersTable.createdAt, start))
    .groupBy(sql`date(created_at)`)
    .orderBy(sql`date(created_at)`);

  res.json(rows.map(r => ({ date: r.date, amount: Number(r.amount), orderCount: r.orderCount })));
});

router.get("/admin/dashboard/recent-orders", requireAdminPermission("dashboard.view"), async (_req, res): Promise<void> => {
  const orders = await db.select().from(ordersTable).orderBy(sql`created_at desc`).limit(10);
  res.json(orders.map(o => ({
    id: o.id, orderNumber: o.orderNumber, customerName: o.customerName, mobile: o.mobile,
    governorate: o.governorateName, status: o.status, paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod, paymentPlan: o.paymentPlan, transferMethod: o.transferMethod,
    paidAmount: Number(o.paidAmount), remainingAmount: o.remainingAmount == null ? null : Number(o.remainingAmount),
    total: Number(o.total), itemCount: 0, createdAt: o.createdAt,
  })));
});

router.get("/admin/dashboard/top-products", requireAdminPermission("dashboard.view"), async (_req, res): Promise<void> => {
  const products = await db.select({
    productId: productsTable.id, nameAr: productsTable.nameAr, coverImage: productsTable.coverImage,
    soldCount: productsTable.salesCount,
    revenue: sql<number>`(${productsTable.price}::numeric * ${productsTable.salesCount})`,
  }).from(productsTable)
    .where(eq(productsTable.status, "active"))
    .orderBy(sql`${productsTable.salesCount} desc`)
    .limit(10);

  res.json(products.map(p => ({ ...p, revenue: Number(p.revenue) })));
});

router.get("/admin/dashboard/low-stock", requireAdminPermission("dashboard.view"), async (_req, res): Promise<void> => {
  const products = await db.select({
    productId: productsTable.id, nameAr: productsTable.nameAr, sku: productsTable.sku,
    stockQuantity: productsTable.stockQuantity, minStockLevel: productsTable.minStockLevel,
  }).from(productsTable)
    .where(and(sql`${productsTable.stockQuantity} <= ${productsTable.minStockLevel}` as ReturnType<typeof eq>, eq(productsTable.status, "active")))
    .orderBy(productsTable.stockQuantity)
    .limit(20);

  res.json(products);
});

export default router;
