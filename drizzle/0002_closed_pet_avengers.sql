ALTER TABLE "anime" ADD COLUMN "broadcast_day" text;--> statement-breakpoint
ALTER TABLE "anime" ADD COLUMN "broadcast_time" text;--> statement-breakpoint
ALTER TABLE "anime" ADD COLUMN "broadcast_timezone" text;--> statement-breakpoint
ALTER TABLE "anime" ADD COLUMN "aired_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "anime" ADD COLUMN "aired_to" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "anime" ADD COLUMN "trailer_youtube_id" text;--> statement-breakpoint
ALTER TABLE "anime" ADD COLUMN "trailer_embed_url" text;--> statement-breakpoint
ALTER TABLE "anime" ADD COLUMN "duration" text;--> statement-breakpoint
ALTER TABLE "anime" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "anime" ADD COLUMN "rank" integer;--> statement-breakpoint
ALTER TABLE "anime" ADD COLUMN "members" integer;--> statement-breakpoint
ALTER TABLE "anime" ADD COLUMN "favorites" integer;--> statement-breakpoint
ALTER TABLE "anime_external_ids" ADD COLUMN "anilist_id" integer;--> statement-breakpoint
CREATE INDEX "anime_broadcast_day_idx" ON "anime" USING btree ("broadcast_day");