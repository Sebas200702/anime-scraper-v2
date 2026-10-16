ALTER TABLE "anime_producer" ADD COLUMN "role" text DEFAULT 'producer' NOT NULL;--> statement-breakpoint
ALTER TABLE "anime_producer" DROP CONSTRAINT "anime_producer_anime_id_producer_id_pk";--> statement-breakpoint
ALTER TABLE "anime_producer" ADD CONSTRAINT "anime_producer_anime_id_producer_id_role_pk" PRIMARY KEY("anime_id","producer_id","role");--> statement-breakpoint
CREATE INDEX "anime_producer_role_idx" ON "anime_producer" USING btree ("role","producer_id");