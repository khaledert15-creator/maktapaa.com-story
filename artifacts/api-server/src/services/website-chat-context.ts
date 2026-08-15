import type { Request } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  categoriesTable,
  customersTable,
  db,
  gradesTable,
  ordersTable,
  productsTable,
  subjectsTable,
} from "@workspace/db";
import { z } from "@workspace/api-zod";

export const websiteChatPageContextSchema = z.object({
  path: z.string().trim().startsWith("/").max(500),
  type: z.enum(["home", "catalog", "product", "cart", "checkout", "account", "order", "other"]),
  productId: z.coerce.number().int().positive().optional(),
  orderId: z.coerce.number().int().positive().optional(),
}).superRefine((value, context) => {
  if (value.type === "product" && !value.productId) {
    context.addIssue({ code: "custom", path: ["productId"], message: "مطلوب في صفحة المنتج" });
  }
  if (value.type === "order" && !value.orderId) {
    context.addIssue({ code: "custom", path: ["orderId"], message: "مطلوب في صفحة الطلب" });
  }
});

export type WebsiteChatPageContext = z.infer<typeof websiteChatPageContextSchema>;

export class WebsiteChatContextError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "WebsiteChatContextError";
  }
}

export interface WebsiteChatIdentity {
  name: string;
  email: string | null;
  phoneNumber: string | null;
}

export function toChatwootE164(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (/^01[0125]\d{8}$/.test(digits)) return `+20${digits.slice(1)}`;
  if (/^201[0125]\d{8}$/.test(digits)) return `+${digits}`;
  return null;
}

export async function buildWebsiteChatContext(req: Request, page?: WebsiteChatPageContext): Promise<{
  identity: WebsiteChatIdentity;
  customAttributes: Record<string, string | number | boolean | null>;
}> {
  const customerId = req.session.customerId ?? null;
  const customer = customerId
    ? (await db.select().from(customersTable).where(eq(customersTable.id, customerId)))[0] ?? null
    : null;

  const cartItems = req.session.cart?.items ?? [];
  const cartProducts = cartItems.length
    ? await db.select({ id: productsTable.id, nameAr: productsTable.nameAr, price: productsTable.price })
        .from(productsTable)
        .where(inArray(productsTable.id, cartItems.map(item => item.productId)))
    : [];
  const quantityByProduct = new Map(cartItems.map(item => [item.productId, item.quantity]));
  const cartTotal = cartProducts.reduce((sum, product) => sum + Number(product.price) * (quantityByProduct.get(product.id) ?? 0), 0);

  const attributes: Record<string, string | number | boolean | null> = {
    website_path: page?.path ?? "/",
    website_page_type: page?.type ?? "other",
    customer_logged_in: Boolean(customer),
    customer_id: customer?.id ?? null,
    cart_items_count: cartItems.reduce((sum, item) => sum + item.quantity, 0),
    cart_subtotal: Number(cartTotal.toFixed(2)),
    cart_products: cartProducts.map(product => `${product.id}:${product.nameAr}`).join(" | ").slice(0, 900),
  };

  if (page?.productId) {
    const [product] = await db.select({
      id: productsTable.id,
      nameAr: productsTable.nameAr,
      sku: productsTable.sku,
      price: productsTable.price,
      stockQuantity: productsTable.stockQuantity,
      categoryName: categoriesTable.nameAr,
      gradeName: gradesTable.nameAr,
      subjectName: subjectsTable.nameAr,
    })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .leftJoin(gradesTable, eq(productsTable.gradeId, gradesTable.id))
      .leftJoin(subjectsTable, eq(productsTable.subjectId, subjectsTable.id))
      .where(eq(productsTable.id, page.productId));
    if (!product) throw new WebsiteChatContextError(404, "المنتج غير موجود");
    Object.assign(attributes, {
      product_id: product.id,
      product_name: product.nameAr,
      product_sku: product.sku,
      product_price: Number(product.price),
      product_stock: product.stockQuantity,
      product_category: product.categoryName,
      product_grade: product.gradeName,
      product_subject: product.subjectName,
    });
  }

  if (page?.orderId) {
    if (!customerId) throw new WebsiteChatContextError(401, "سجّل الدخول أولًا للتحدث عن الطلب");
    const [order] = await db.select({
      id: ordersTable.id,
      orderNumber: ordersTable.orderNumber,
      status: ordersTable.status,
      total: ordersTable.total,
      createdAt: ordersTable.createdAt,
    }).from(ordersTable).where(and(eq(ordersTable.id, page.orderId), eq(ordersTable.customerId, customerId)));
    if (!order) throw new WebsiteChatContextError(404, "الطلب غير موجود");
    Object.assign(attributes, {
      order_id: order.id,
      order_number: order.orderNumber,
      order_status: order.status,
      order_total: Number(order.total),
      order_created_at: order.createdAt.toISOString(),
    });
  }

  return {
    identity: {
      name: customer?.name ?? "زائر مكتبة دوت كوم",
      email: customer?.email ?? null,
      phoneNumber: toChatwootE164(customer?.primaryPhone),
    },
    customAttributes: attributes,
  };
}
