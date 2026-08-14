import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { customersTable } from "./customers";

export const websiteChatThreadStatusEnum = pgEnum("website_chat_thread_status", [
  "provisioning",
  "ready",
  "failed",
]);

export const websiteChatThreadsTable = pgTable("website_chat_threads", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "cascade" }),
  guestKeyHash: text("guest_key_hash"),
  chatwootContactId: integer("chatwoot_contact_id"),
  chatwootSourceIdEncrypted: text("chatwoot_source_id_encrypted"),
  chatwootPubsubTokenEncrypted: text("chatwoot_pubsub_token_encrypted"),
  chatwootConversationId: integer("chatwoot_conversation_id"),
  chatwootConversationUuid: text("chatwoot_conversation_uuid"),
  status: websiteChatThreadStatusEnum("status").notNull().default("provisioning"),
  failureCode: text("failure_code"),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => [
  uniqueIndex("website_chat_threads_customer_unique").on(table.customerId).where(sql`${table.customerId} IS NOT NULL`),
  uniqueIndex("website_chat_threads_guest_unique").on(table.guestKeyHash).where(sql`${table.guestKeyHash} IS NOT NULL`),
  index("website_chat_threads_status_updated_idx").on(table.status, table.updatedAt),
  index("website_chat_threads_conversation_idx").on(table.chatwootConversationId),
  check("website_chat_threads_has_owner", sql`${table.customerId} IS NOT NULL OR ${table.guestKeyHash} IS NOT NULL`),
  check("website_chat_threads_contact_id_positive", sql`${table.chatwootContactId} IS NULL OR ${table.chatwootContactId} > 0`),
  check("website_chat_threads_conversation_id_positive", sql`${table.chatwootConversationId} IS NULL OR ${table.chatwootConversationId} > 0`),
]);

export type WebsiteChatThread = typeof websiteChatThreadsTable.$inferSelect;
