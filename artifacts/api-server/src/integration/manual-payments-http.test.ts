import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  auditLogsTable,
  customersTable,
  db,
  governoratesTable,
  manualPaymentSettingsTable,
  ordersTable,
  paymentAttemptsTable,
  paymentReviewHistoryTable,
  paymentSendersTable,
  pool,
  productsTable,
  stockMovementsTable,
  usersTable,
} from "@workspace/db";
import { imageStorage } from "../services/storage";

let server: Server;
let baseUrl = "";
const orderIds: number[] = [];
const attemptIds: number[] = [];
const senderIds: number[] = [];
const userIds: number[] = [];
const customerIds: number[] = [];
let productId = 0;
let originalSettings: (typeof manualPaymentSettingsTable.$inferSelect)[] = [];

before(async () => {
  originalSettings = await db.select().from(manualPaymentSettingsTable);
  await db.insert(manualPaymentSettingsTable).values([
    { method: "instapay", displayNameAr: "InstaPay للاختبار", transferDestination: "test@instapay", accountHolderName: "مكتبة دوت كوم", instructionsAr: "بيانات اختبار محلية", isActive: true, sortOrder: 1 },
    { method: "mobile_wallet", displayNameAr: "محفظة اختبار", transferDestination: "01000000000", accountHolderName: "مكتبة دوت كوم", instructionsAr: "بيانات اختبار محلية", isActive: true, sortOrder: 2 },
  ]).onConflictDoUpdate({ target: manualPaymentSettingsTable.method, set: { isActive: true } });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP test server did not start");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (attemptIds.length) {
    const proofRows = await db.select({ key: paymentAttemptsTable.proofStorageKey }).from(paymentAttemptsTable).where(inArray(paymentAttemptsTable.id, attemptIds));
    await Promise.all(proofRows.flatMap(row => row.key ? [imageStorage.deleteImage(row.key).catch(() => undefined)] : []));
    await db.delete(auditLogsTable).where(and(eq(auditLogsTable.entityType, "payment_attempt"), inArray(auditLogsTable.entityId, attemptIds.map(String))));
  }
  if (productId) await db.delete(stockMovementsTable).where(eq(stockMovementsTable.productId, productId));
  if (orderIds.length) await db.delete(ordersTable).where(inArray(ordersTable.id, orderIds));
  if (senderIds.length) await db.delete(paymentSendersTable).where(inArray(paymentSendersTable.id, senderIds));
  if (productId) await db.delete(productsTable).where(eq(productsTable.id, productId));
  if (customerIds.length) await db.delete(customersTable).where(inArray(customersTable.id, customerIds));
  if (userIds.length) await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  for (const setting of originalSettings) {
    await db.update(manualPaymentSettingsTable).set({
      displayNameAr: setting.displayNameAr,
      transferDestination: setting.transferDestination,
      accountHolderName: setting.accountHolderName,
      instructionsAr: setting.instructionsAr,
      isActive: setting.isActive,
      sortOrder: setting.sortOrder,
    }).where(eq(manualPaymentSettingsTable.method, setting.method));
  }
  const originalMethods = new Set(originalSettings.map(setting => setting.method));
  for (const method of ["instapay", "mobile_wallet"] as const) {
    if (!originalMethods.has(method)) await db.delete(manualPaymentSettingsTable).where(eq(manualPaymentSettingsTable.method, method));
  }
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await pool.end();
});

function cookieFrom(response: Response, fallback = "") {
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? fallback;
}

async function json(path: string, init: RequestInit = {}, cookie = "") {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(cookie ? { cookie } : {}), ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
  });
}

async function createOrder(input: {
  plan?: "deposit_100" | "full";
  method?: "instapay" | "mobile_wallet";
  cookie?: string;
  paymentMethod?: "manual_transfer" | "cash_on_delivery";
  mobileIndex: number;
}) {
  const [governorate] = await db.select().from(governoratesTable).where(eq(governoratesTable.isActive, true)).limit(1);
  assert.ok(governorate, "a seeded active governorate is required");
  const paymentMethod = input.paymentMethod ?? "manual_transfer";
  const response = await json("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      customerName: `عميل دفع ${input.mobileIndex}`,
      mobile: `010${String(11_000_000 + input.mobileIndex).slice(-8)}`,
      governorateId: governorate.id,
      city: "مدينة الاختبار",
      detailedAddress: "عنوان محلي واضح لاختبار الدفع اليدوي",
      paymentMethod,
      paymentPlan: paymentMethod === "manual_transfer" ? input.plan : undefined,
      transferMethod: paymentMethod === "manual_transfer" ? input.method : undefined,
      checkoutToken: randomUUID(),
      cartItems: [{ productId, quantity: 1 }],
    }),
  }, input.cookie);
  const body = await response.json() as { id?: number; orderNumber?: string; total?: number; requiredPaymentAmount?: number; paymentStatus?: string; paymentMethod?: string; error?: string };
  assert.equal(response.status, 201, `order creation failed: ${body.error ?? "unknown"}`);
  assert.ok(body.id && body.orderNumber);
  orderIds.push(body.id);
  return { order: body as Required<Pick<typeof body, "id" | "orderNumber" | "total">> & typeof body, cookie: cookieFrom(response, input.cookie) };
}

async function submitAttempt(orderNumber: string, cookie: string, fields: { sender?: string; amount: number; reference?: string; proof?: Blob }) {
  const form = new FormData();
  if (fields.sender !== undefined) form.set("senderIdentifier", fields.sender);
  form.set("amount", String(fields.amount));
  if (fields.reference) form.set("transactionReference", fields.reference);
  if (fields.proof) form.set("proofImage", fields.proof, "proof.png");
  return fetch(`${baseUrl}/api/orders/${orderNumber}/payment-attempts`, { method: "POST", headers: { cookie }, body: form });
}

async function createEmployee(permissions: string[]) {
  const suffix = randomUUID();
  const password = `Secure-${suffix}`;
  const [user] = await db.insert(usersTable).values({ name: "مراجع دفع محلي", email: `payment-${suffix}@example.test`, passwordHash: await bcrypt.hash(password, 12), role: "accountant", permissions }).returning();
  userIds.push(user.id);
  const response = await json("/api/auth/admin/login", { method: "POST", body: JSON.stringify({ email: user.email, password }) });
  assert.equal(response.status, 200);
  return { user, cookie: cookieFrom(response) };
}

async function review(attemptId: number, cookie: string, body: Record<string, unknown>) {
  return json(`/api/admin/payments/${attemptId}/review`, { method: "PATCH", body: JSON.stringify(body) }, cookie);
}

async function rememberAttempt(response: Response) {
  const body = await response.json() as { id?: number; status?: string; riskLevel?: string; previousUseCount?: number; hasProof?: boolean; error?: string };
  if (body.id) {
    attemptIds.push(body.id);
    const [attempt] = await db.select({ senderId: paymentAttemptsTable.senderId }).from(paymentAttemptsTable).where(eq(paymentAttemptsTable.id, body.id));
    if (attempt && !senderIds.includes(attempt.senderId)) senderIds.push(attempt.senderId);
  }
  return body;
}

test("manual payment HTTP flow covers guest, account, review, risk, permissions and legacy COD", async () => {
  const suffix = randomUUID();
  const [product] = await db.insert(productsTable).values({ nameAr: `كتاب دفع ${suffix}`, slug: `manual-payment-${suffix}`, price: "500", stockQuantity: 30, status: "active" }).returning();
  productId = product.id;
  const reviewer = await createEmployee(["dashboard.view", "orders.view", "payments.view", "payments.review", "payments.confirm", "payments.reject", "payments.history", "payments.override", "payments.settings"]);
  const limited = await createEmployee(["payments.view", "payments.review"]);

  const settingsResponse = await json("/api/payments/settings");
  assert.equal(settingsResponse.status, 200);
  assert.equal((await settingsResponse.json() as unknown[]).length, 2, "transfer settings are PostgreSQL-backed and public");

  const deposit = await createOrder({ plan: "deposit_100", method: "instapay", mobileIndex: 1 });
  assert.equal(deposit.order.requiredPaymentAmount, 100);
  assert.equal(deposit.order.paymentStatus, "awaiting_transfer");
  const [awaitingDeposit] = await db.select().from(ordersTable).where(eq(ordersTable.id, deposit.order.id));
  assert.equal(Number(awaitingDeposit.remainingAmount), Number(awaitingDeposit.total) - 100, "the future COD remainder is snapshotted before verification");
  const depositSubmission = await submitAttempt(deposit.order.orderNumber!, deposit.cookie, { sender: "٠١٠ ١٢٣٤ ٥٦٧٨", amount: 100, reference: "REF-١٠٠-A" });
  assert.equal(depositSubmission.status, 201);
  const depositAttempt = await rememberAttempt(depositSubmission);
  assert.equal(depositAttempt.status, "pending_verification");
  assert.equal(depositAttempt.hasProof, false, "proof screenshot is optional");
  assert.equal((await fetch(`${baseUrl}/api/orders/${deposit.order.orderNumber}/payment-attempts`)).status, 404, "guest order attempts are IDOR protected");
  assert.equal((await fetch(`${baseUrl}/api/orders/${deposit.order.orderNumber}/payment-attempts`, { headers: { cookie: deposit.cookie } })).status, 200);

  const concurrent = await Promise.all([
    review(depositAttempt.id!, reviewer.cookie, { decision: "confirmed" }),
    review(depositAttempt.id!, reviewer.cookie, { decision: "confirmed" }),
  ]);
  assert.deepEqual(concurrent.map(response => response.status), [200, 200], "double confirmation is idempotent under concurrency");
  const [confirmedDeposit] = await db.select().from(ordersTable).where(eq(ordersTable.id, deposit.order.id));
  assert.equal(confirmedDeposit.paymentStatus, "partially_paid");
  assert.equal(Number(confirmedDeposit.paidAmount), 100);
  assert.equal(Number(confirmedDeposit.remainingAmount), Number(confirmedDeposit.total) - 100);
  assert.equal((await db.select().from(paymentReviewHistoryTable).where(eq(paymentReviewHistoryTable.attemptId, depositAttempt.id!))).length, 1, "concurrent confirmation writes one review history record");
  assert.equal((await db.select().from(auditLogsTable).where(and(eq(auditLogsTable.entityType, "payment_attempt"), eq(auditLogsTable.entityId, String(depositAttempt.id))))).length, 1, "confirmation writes one audit record");

  const full = await createOrder({ plan: "full", method: "mobile_wallet", mobileIndex: 2 });
  assert.equal(full.order.requiredPaymentAmount, full.order.total);
  const [awaitingFull] = await db.select().from(ordersTable).where(eq(ordersTable.id, full.order.id));
  assert.equal(Number(awaitingFull.remainingAmount), 0, "full-payment plans snapshot no COD remainder");
  const png = await sharp({ create: { width: 24, height: 24, channels: 3, background: "#0ea5e9" } }).png().toBuffer();
  const fullSubmission = await submitAttempt(full.order.orderNumber!, full.cookie, { sender: "+201011111111", amount: full.order.total!, reference: "FULL-200", proof: new Blob([new Uint8Array(png)], { type: "image/png" }) });
  assert.equal(fullSubmission.status, 201);
  const fullAttempt = await rememberAttempt(fullSubmission);
  assert.equal(fullAttempt.hasProof, true, "a valid PNG proof is accepted");
  assert.equal((await review(fullAttempt.id!, reviewer.cookie, { decision: "confirmed" })).status, 200);
  const [confirmedFull] = await db.select().from(ordersTable).where(eq(ordersTable.id, full.order.id));
  assert.equal(confirmedFull.paymentStatus, "fully_paid");
  assert.equal(Number(confirmedFull.paidAmount), Number(confirmedFull.total));
  assert.equal(Number(confirmedFull.remainingAmount), 0);

  const registration = await json("/api/auth/register", { method: "POST", body: JSON.stringify({ name: "عميل مسجل للدفع", mobile: "01087654321", email: `manual-${suffix}@example.test`, password: "Strong-Test-123", primaryPhoneHasWhatsApp: true }) });
  assert.equal(registration.status, 201);
  const registrationBody = await registration.json() as { customer: { id: number } };
  customerIds.push(registrationBody.customer.id);
  const customerCookie = cookieFrom(registration);
  const accountOrder = await createOrder({ plan: "deposit_100", method: "instapay", cookie: customerCookie, mobileIndex: 3 });
  const accountSubmission = await submitAttempt(accountOrder.order.orderNumber!, accountOrder.cookie, { sender: "+20 10 1234 5678", amount: 100 });
  assert.equal(accountSubmission.status, 201);
  const accountAttempt = await rememberAttempt(accountSubmission);
  assert.equal(accountAttempt.riskLevel, "yellow", "the same normalized sender produces a reuse warning");
  assert.equal(accountAttempt.previousUseCount, 1);
  const [accountOrderRow] = await db.select().from(ordersTable).where(eq(ordersTable.id, accountOrder.order.id));
  assert.equal(accountOrderRow.customerId, registrationBody.customer.id, "logged-in checkout links the order to the customer");
  assert.equal((await review(accountAttempt.id!, reviewer.cookie, { decision: "needs_review", notes: "مراجعة تكرار المرسل" })).status, 200);
  assert.equal((await review(accountAttempt.id!, reviewer.cookie, { decision: "confirmed" })).status, 200);

  const validationOrder = await createOrder({ plan: "deposit_100", method: "instapay", mobileIndex: 4 });
  assert.equal((await submitAttempt(validationOrder.order.orderNumber!, validationOrder.cookie, { amount: 100 })).status, 400, "sender identifier is mandatory");
  const invalidProof = new Blob(["not an image"], { type: "image/png" });
  assert.equal((await submitAttempt(validationOrder.order.orderNumber!, validationOrder.cookie, { sender: "01022222222", amount: 100, proof: invalidProof })).status, 400, "a forged image MIME is blocked");

  const rejectedOrder = await createOrder({ plan: "deposit_100", method: "instapay", mobileIndex: 5 });
  const rejectedSubmission = await submitAttempt(rejectedOrder.order.orderNumber!, rejectedOrder.cookie, { sender: "01033333333", amount: 100, reference: "REJECTED-REF" });
  const rejectedAttempt = await rememberAttempt(rejectedSubmission);
  assert.equal((await review(rejectedAttempt.id!, reviewer.cookie, { decision: "rejected", rejectionReason: "لم يتم العثور على التحويل" })).status, 200);
  const reusedRejectedOrder = await createOrder({ plan: "deposit_100", method: "mobile_wallet", mobileIndex: 6 });
  const reusedRejectedSubmission = await submitAttempt(reusedRejectedOrder.order.orderNumber!, reusedRejectedOrder.cookie, { sender: "+20 10 3333 3333", amount: 100 });
  const reusedRejectedAttempt = await rememberAttempt(reusedRejectedSubmission);
  assert.equal(reusedRejectedAttempt.riskLevel, "red", "a previously rejected sender creates a strong warning");
  assert.equal((await review(reusedRejectedAttempt.id!, limited.cookie, { decision: "confirmed" })).status, 403, "server-side permissions block confirmation");

  const duplicateOrder = await createOrder({ plan: "deposit_100", method: "instapay", mobileIndex: 7 });
  const duplicateSubmission = await submitAttempt(duplicateOrder.order.orderNumber!, duplicateOrder.cookie, { sender: "01044444444", amount: 100, reference: "ref ١٠٠ a" });
  const duplicateAttempt = await rememberAttempt(duplicateSubmission);
  assert.equal(duplicateAttempt.riskLevel, "red");
  assert.equal((await review(duplicateAttempt.id!, reviewer.cookie, { decision: "confirmed" })).status, 409, "duplicate confirmed reference requires an override");
  assert.equal((await review(duplicateAttempt.id!, reviewer.cookie, { decision: "confirmed", overrideDuplicateReference: true, notes: "تحقق محاسبي مستقل من التحويلين" })).status, 200);

  const concurrentReference = `CONCURRENT-${suffix}`;
  const concurrentReferenceOrderA = await createOrder({ plan: "deposit_100", method: "instapay", mobileIndex: 9 });
  const concurrentReferenceOrderB = await createOrder({ plan: "deposit_100", method: "instapay", mobileIndex: 10 });
  const concurrentReferenceAttemptA = await rememberAttempt(await submitAttempt(concurrentReferenceOrderA.order.orderNumber!, concurrentReferenceOrderA.cookie, { sender: "01055550001", amount: 100, reference: concurrentReference }));
  const concurrentReferenceAttemptB = await rememberAttempt(await submitAttempt(concurrentReferenceOrderB.order.orderNumber!, concurrentReferenceOrderB.cookie, { sender: "01055550002", amount: 100, reference: concurrentReference }));
  const concurrentReferenceReviews = await Promise.all([
    review(concurrentReferenceAttemptA.id!, reviewer.cookie, { decision: "confirmed" }),
    review(concurrentReferenceAttemptB.id!, reviewer.cookie, { decision: "confirmed" }),
  ]);
  assert.deepEqual(concurrentReferenceReviews.map(response => response.status).sort(), [200, 409], "concurrent duplicate references cannot both be confirmed");
  const confirmedConcurrentReference = await db.select({ id: paymentAttemptsTable.id }).from(paymentAttemptsTable).where(and(
    inArray(paymentAttemptsTable.id, [concurrentReferenceAttemptA.id!, concurrentReferenceAttemptB.id!]),
    eq(paymentAttemptsTable.status, "confirmed"),
  ));
  assert.equal(confirmedConcurrentReference.length, 1);

  const searched = await json("/api/admin/payments?status=all&q=٠١٠١٢٣٤٥٦٧٨", {}, reviewer.cookie);
  assert.equal(searched.status, 200);
  assert.ok((await searched.json() as { items: { senderIdentifier: string }[] }).items.length >= 2, "admin search accepts Arabic digits and normalized sender identities");
  const detail = await json(`/api/admin/payments/${accountAttempt.id}`, {}, reviewer.cookie);
  const detailBody = await detail.json() as { senderHistory: unknown[]; reviewHistory: unknown[] };
  assert.ok(detailBody.senderHistory.length >= 2, "authorized employees can view sender history");
  assert.ok(detailBody.reviewHistory.length >= 2, "all review decisions remain in history");
  const hiddenHistory = await json(`/api/admin/payments/${accountAttempt.id}`, {}, limited.cookie).then(response => response.json()) as { senderHistory: unknown[] };
  assert.equal(hiddenHistory.senderHistory.length, 0, "payment sender history requires its own permission");

  const legacy = await createOrder({ paymentMethod: "cash_on_delivery", mobileIndex: 8 });
  assert.equal(legacy.order.paymentMethod, "cash_on_delivery");
  assert.equal(legacy.order.paymentStatus, "cash_on_delivery", "legacy COD checkout remains compatible");
});
