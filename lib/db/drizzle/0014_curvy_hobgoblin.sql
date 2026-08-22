CREATE TYPE "public"."website_chat_thread_status" AS ENUM('provisioning', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "website_chat_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"guest_key_hash" text,
	"chatwoot_contact_id" integer,
	"chatwoot_source_id_encrypted" text,
	"chatwoot_pubsub_token_encrypted" text,
	"chatwoot_conversation_id" integer,
	"chatwoot_conversation_uuid" text,
	"status" "website_chat_thread_status" DEFAULT 'provisioning' NOT NULL,
	"failure_code" text,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_chat_threads_has_owner" CHECK ("website_chat_threads"."customer_id" IS NOT NULL OR "website_chat_threads"."guest_key_hash" IS NOT NULL),
	CONSTRAINT "website_chat_threads_contact_id_positive" CHECK ("website_chat_threads"."chatwoot_contact_id" IS NULL OR "website_chat_threads"."chatwoot_contact_id" > 0),
	CONSTRAINT "website_chat_threads_conversation_id_positive" CHECK ("website_chat_threads"."chatwoot_conversation_id" IS NULL OR "website_chat_threads"."chatwoot_conversation_id" > 0)
);
--> statement-breakpoint
ALTER TABLE "website_chat_threads" ADD CONSTRAINT "website_chat_threads_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "website_chat_threads_customer_unique" ON "website_chat_threads" USING btree ("customer_id") WHERE "website_chat_threads"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "website_chat_threads_guest_unique" ON "website_chat_threads" USING btree ("guest_key_hash") WHERE "website_chat_threads"."guest_key_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "website_chat_threads_status_updated_idx" ON "website_chat_threads" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "website_chat_threads_conversation_idx" ON "website_chat_threads" USING btree ("chatwoot_conversation_id");