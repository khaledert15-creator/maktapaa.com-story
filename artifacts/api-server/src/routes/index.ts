// @ts-nocheck
import { Router } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import productsRouter from "./products.js";
import contentRouter from "./content.js";
import shippingRouter from "./shipping.js";
import cartRouter from "./cart.js";
import ordersRouter from "./orders.js";
import adminDashboardRouter from "./admin/dashboard.js";
import adminProductsRouter from "./admin/products.js";
import adminOrdersRouter from "./admin/orders.js";
import adminCustomersRouter from "./admin/customers.js";
import adminCouponsRouter from "./admin/coupons.js";
import adminReportsRouter from "./admin/reports.js";

const router = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(productsRouter);
router.use(contentRouter);
router.use(shippingRouter);
router.use(cartRouter);
router.use(ordersRouter);
router.use(adminDashboardRouter);
router.use(adminProductsRouter);
router.use(adminOrdersRouter);
router.use(adminCustomersRouter);
router.use(adminCouponsRouter);
router.use(adminReportsRouter);

export default router;
