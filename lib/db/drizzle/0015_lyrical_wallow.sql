ALTER TABLE "website_chat_threads" DROP CONSTRAINT "website_chat_threads_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "website_chat_threads" ADD CONSTRAINT "website_chat_threads_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;