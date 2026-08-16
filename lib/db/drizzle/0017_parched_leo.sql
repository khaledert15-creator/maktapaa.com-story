CREATE TYPE "public"."manual_payment_plan" AS ENUM('deposit_100', 'full');--> statement-breakpoint
CREATE TYPE "public"."manual_transfer_method" AS ENUM('instapay', 'mobile_wallet');--> statement-breakpoint
CREATE TYPE "public"."payment_attempt_status" AS ENUM('pending_verification', 'confirmed', 'rejected', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."payment_risk_level" AS ENUM('none', 'yellow', 'orange', 'red');--> statement-breakpoint
ALTER TYPE "public"."payment_method" ADD VALUE 'manual_transfer';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'awaiting_transfer';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'pending_verification';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'partially_paid';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'fully_paid';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'rejected';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'needs_review';--> statement-breakpoint
CREATE TABLE "manual_payment_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"method" "manual_transfer_method" NOT NULL,
	"display_name_ar" text NOT NULL,
	"transfer_destination" text NOT NULL,
	"account_holder_name" text,
	"instructions_ar" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_payment_settings_method_unique" UNIQUE("method"),
	CONSTRAINT "manual_payment_settings_sort_non_negative" CHECK ("manual_payment_settings"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"payment_plan" "manual_payment_plan" NOT NULL,
	"transfer_method" "manual_transfer_method" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"sender_identifier_original" text NOT NULL,
	"sender_identifier_normalized" text NOT NULL,
	"transaction_reference_original" text,
	"transaction_reference_normalized" text,
	"proof_image_url" text,
	"proof_storage_key" text,
	"proof_mime_type" text,
	"proof_size_bytes" integer,
	"proof_fingerprint" text,
	"status" "payment_attempt_status" DEFAULT 'pending_verification' NOT NULL,
	"risk_level" "payment_risk_level" DEFAULT 'none' NOT NULL,
	"risk_reasons" text[] DEFAULT '{}' NOT NULL,
	"reviewer_id" integer,
	"reviewer_name" text,
	"rejection_reason" text,
	"review_notes" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempts_amount_positive" CHECK ("payment_attempts"."amount" > 0),
	CONSTRAINT "payment_attempts_proof_size_non_negative" CHECK ("payment_attempts"."proof_size_bytes" IS NULL OR "payment_attempts"."proof_size_bytes" >= 0),
	CONSTRAINT "payment_attempts_rejection_reason_required" CHECK ("payment_attempts"."status" <> 'rejected' OR length(trim(coalesce("payment_attempts"."rejection_reason", ''))) > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_review_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"attempt_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"from_status" "payment_attempt_status",
	"to_status" "payment_attempt_status" NOT NULL,
	"employee_id" integer,
	"employee_name" text,
	"notes" text,
	"override_duplicate_reference" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_senders" (
	"id" serial PRIMARY KEY NOT NULL,
	"normalized_identifier" text NOT NULL,
	"latest_original_identifier" text NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"first_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_senders_normalized_identifier_unique" UNIQUE("normalized_identifier"),
	CONSTRAINT "payment_senders_usage_non_negative" CHECK ("payment_senders"."usage_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_plan" "manual_payment_plan";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "transfer_method" "manual_transfer_method";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "required_payment_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_amount" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "remaining_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_sender_id_payment_senders_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."payment_senders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_review_history" ADD CONSTRAINT "payment_review_history_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_review_history" ADD CONSTRAINT "payment_review_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_review_history" ADD CONSTRAINT "payment_review_history_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manual_payment_settings_public_idx" ON "manual_payment_settings" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE INDEX "payment_attempts_status_created_idx" ON "payment_attempts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payment_attempts_order_created_idx" ON "payment_attempts" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_attempts_sender_created_idx" ON "payment_attempts" USING btree ("sender_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_attempts_sender_identifier_idx" ON "payment_attempts" USING btree ("sender_identifier_normalized","created_at");--> statement-breakpoint
CREATE INDEX "payment_attempts_reference_idx" ON "payment_attempts" USING btree ("transaction_reference_normalized");--> statement-breakpoint
CREATE INDEX "payment_attempts_risk_idx" ON "payment_attempts" USING btree ("risk_level","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_one_open_per_order" ON "payment_attempts" USING btree ("order_id") WHERE "payment_attempts"."status" IN ('pending_verification', 'needs_review');--> statement-breakpoint
CREATE INDEX "payment_review_history_attempt_created_idx" ON "payment_review_history" USING btree ("attempt_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_review_history_order_created_idx" ON "payment_review_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_senders_last_used_idx" ON "payment_senders" USING btree ("last_used_at");--> statement-breakpoint
CREATE INDEX "orders_payment_status_created_idx" ON "orders" USING btree ("payment_status","created_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_paid_amount_non_negative" CHECK ("orders"."paid_amount" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_remaining_amount_non_negative" CHECK ("orders"."remaining_amount" IS NULL OR "orders"."remaining_amount" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_required_payment_non_negative" CHECK ("orders"."required_payment_amount" IS NULL OR "orders"."required_payment_amount" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_manual_payment_fields_valid" CHECK ("orders"."payment_method"::text <> 'manual_transfer' OR ("orders"."payment_plan" IS NOT NULL AND "orders"."transfer_method" IS NOT NULL AND "orders"."required_payment_amount" IS NOT NULL AND "orders"."remaining_amount" IS NOT NULL));--> statement-breakpoint
INSERT INTO "manual_payment_settings" ("method", "display_name_ar", "transfer_destination", "instructions_ar", "is_active", "sort_order") VALUES
  ('instapay', 'InstaPay', 'غير مُعد بعد', 'يجب على الإدارة إدخال بيانات التحويل الصحيحة قبل التفعيل.', false, 1),
  ('mobile_wallet', 'محفظة هاتف', 'غير مُعد بعد', 'يجب على الإدارة إدخال رقم المحفظة الصحيح قبل التفعيل.', false, 2)
ON CONFLICT ("method") DO NOTHING;
