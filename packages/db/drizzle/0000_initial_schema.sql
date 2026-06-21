CREATE TABLE "vat_request_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_chat_id" text NOT NULL,
	"country_code" text NOT NULL,
	"vat_number" text NOT NULL,
	"expiration_date" timestamp with time zone NOT NULL,
	"error" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vat_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_chat_id" text NOT NULL,
	"country_code" text NOT NULL,
	"vat_number" text NOT NULL,
	"expiration_date" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "vat_request_errors_request_idx" ON "vat_request_errors" USING btree ("telegram_chat_id","country_code","vat_number");--> statement-breakpoint
CREATE UNIQUE INDEX "vat_requests_chat_country_number_unique" ON "vat_requests" USING btree ("telegram_chat_id","country_code","vat_number");--> statement-breakpoint
CREATE INDEX "vat_requests_telegram_chat_id_idx" ON "vat_requests" USING btree ("telegram_chat_id");