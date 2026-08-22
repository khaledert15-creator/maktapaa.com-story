import { sql } from "drizzle-orm";
import { boolean, check, index, integer, numeric, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { ordersTable, manualPaymentPlanEnum, manualTransferMethodEnum } from "./orders";
import { usersTable } from "./users";

export const paymentAttemptStatusEnum = pgEnum("payment_attempt_status", [
  "pending_verification",
  "confirmed",
  "rejected",
  "needs_review",
]);

export const paymentRiskLevelEnum = pgEnum("payment_risk_level", ["none", "yellow", "orange", "red"]);

export const manualPaymentSettingsTable = pgTable("manual_payment_settings", {
  id: serial("id").primaryKey(),
  method: manualTransferMethodEnum("method").notNull().unique(),
  displayNameAr: text("display_name_ar").notNull(),
  transferDestination: text("transfer_destination").notNull(),
  accountHolderName: text("account_holder_name"),
  instructionsAr: text("instructions_ar"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => [
  check("manual_payment_settings_sort_non_negative", sql`${table.sortOrder} >= 0`),
  index("manual_payment_settings_public_idx").on(table.isActive, table.sortOrder),
]);

export const paymentSendersTable = pgTable("payment_senders", {
  id: serial("id").primaryKey(),
  normalizedIdentifier: text("normalized_identifier").notNull().unique(),
  latestOriginalIdentifier: text("latest_original_identifier").notNull(),
  usageCount: integer("usage_count").notNull().default(0),
  firstUsedAt: timestamp("first_used_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => [
  check("payment_senders_usage_non_negative", sql`${table.usageCount} >= 0`),
  index("payment_senders_last_used_idx").on(table.lastUsedAt),
]);

export const paymentAttemptsTable = pgTable("payment_attempts", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").notNull().references(() => paymentSendersTable.id, { onDelete: "restrict" }),
  paymentPlan: manualPaymentPlanEnum("payment_plan").notNull(),
  transferMethod: manualTransferMethodEnum("transfer_method").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  senderIdentifierOriginal: text("sender_identifier_original").notNull(),
  senderIdentifierNormalized: text("sender_identifier_normalized").notNull(),
  transactionReferenceOriginal: text("transaction_reference_original"),
  transactionReferenceNormalized: text("transaction_reference_normalized"),
  proofImageUrl: text("proof_image_url"),
  proofStorageKey: text("proof_storage_key"),
  proofMimeType: text("proof_mime_type"),
  proofSizeBytes: integer("proof_size_bytes"),
  proofFingerprint: text("proof_fingerprint"),
  status: paymentAttemptStatusEnum("status").notNull().default("pending_verification"),
  riskLevel: paymentRiskLevelEnum("risk_level").notNull().default("none"),
  riskReasons: text("risk_reasons").array().notNull().default([]),
  reviewerId: integer("reviewer_id").references(() => usersTable.id, { onDelete: "set null" }),
  reviewerName: text("reviewer_name"),
  rejectionReason: text("rejection_reason"),
  reviewNotes: text("review_notes"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => [
  check("payment_attempts_amount_positive", sql`${table.amount} > 0`),
  check("payment_attempts_proof_size_non_negative", sql`${table.proofSizeBytes} IS NULL OR ${table.proofSizeBytes} >= 0`),
  check("payment_attempts_rejection_reason_required", sql`${table.status} <> 'rejected' OR length(trim(coalesce(${table.rejectionReason}, ''))) > 0`),
  index("payment_attempts_status_created_idx").on(table.status, table.createdAt),
  index("payment_attempts_order_created_idx").on(table.orderId, table.createdAt),
  index("payment_attempts_sender_created_idx").on(table.senderId, table.createdAt),
  index("payment_attempts_sender_identifier_idx").on(table.senderIdentifierNormalized, table.createdAt),
  index("payment_attempts_reference_idx").on(table.transactionReferenceNormalized),
  index("payment_attempts_risk_idx").on(table.riskLevel, table.createdAt),
  uniqueIndex("payment_attempts_one_open_per_order").on(table.orderId).where(sql`${table.status} IN ('pending_verification', 'needs_review')`),
]);

export const paymentReviewHistoryTable = pgTable("payment_review_history", {
  id: serial("id").primaryKey(),
  attemptId: integer("attempt_id").notNull().references(() => paymentAttemptsTable.id, { onDelete: "cascade" }),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  fromStatus: paymentAttemptStatusEnum("from_status"),
  toStatus: paymentAttemptStatusEnum("to_status").notNull(),
  employeeId: integer("employee_id").references(() => usersTable.id, { onDelete: "set null" }),
  employeeName: text("employee_name"),
  notes: text("notes"),
  overrideDuplicateReference: boolean("override_duplicate_reference").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("payment_review_history_attempt_created_idx").on(table.attemptId, table.createdAt),
  index("payment_review_history_order_created_idx").on(table.orderId, table.createdAt),
]);

export type PaymentAttempt = typeof paymentAttemptsTable.$inferSelect;
export type PaymentSender = typeof paymentSendersTable.$inferSelect;
export type ManualPaymentSetting = typeof manualPaymentSettingsTable.$inferSelect;
