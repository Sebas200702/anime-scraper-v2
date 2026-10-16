DROP INDEX "anime_media_anime_id_type_idx";--> statement-breakpoint
DROP INDEX "character_media_character_id_type_idx";--> statement-breakpoint
DROP INDEX "episode_media_episode_id_type_idx";--> statement-breakpoint
DROP INDEX "music_media_music_id_type_idx";--> statement-breakpoint
DROP INDEX "staff_media_staff_id_type_idx";--> statement-breakpoint
ALTER TABLE "anime_media" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "anime_media" ADD COLUMN "priority" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "character_media" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "character_media" ADD COLUMN "priority" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "episode_media" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "episode_media" ADD COLUMN "priority" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "music_media" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "music_media" ADD COLUMN "priority" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "producer_media" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "producer_media" ADD COLUMN "priority" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_media" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "staff_media" ADD COLUMN "priority" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
CREATE INDEX "anime_media_anime_id_type_priority_idx" ON "anime_media" USING btree ("anime_id","media_type","priority");--> statement-breakpoint
CREATE INDEX "character_media_character_id_type_priority_idx" ON "character_media" USING btree ("character_id","media_type","priority");--> statement-breakpoint
CREATE INDEX "episode_media_episode_id_type_priority_idx" ON "episode_media" USING btree ("episode_id","media_type","priority");--> statement-breakpoint
CREATE INDEX "music_media_music_id_type_priority_idx" ON "music_media" USING btree ("music_id","media_type","priority");--> statement-breakpoint
CREATE INDEX "producer_media_producer_id_type_priority_idx" ON "producer_media" USING btree ("producer_id","media_type","priority");--> statement-breakpoint
CREATE INDEX "staff_media_staff_id_type_priority_idx" ON "staff_media" USING btree ("staff_id","media_type","priority");