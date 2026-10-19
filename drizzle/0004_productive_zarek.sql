CREATE UNIQUE INDEX "anime_media_entity_type_src_unique" ON "anime_media" USING btree ("anime_id","media_type","src");--> statement-breakpoint
CREATE UNIQUE INDEX "character_media_entity_type_src_unique" ON "character_media" USING btree ("character_id","media_type","src");--> statement-breakpoint
CREATE UNIQUE INDEX "episode_media_entity_type_src_unique" ON "episode_media" USING btree ("episode_id","media_type","src");--> statement-breakpoint
CREATE UNIQUE INDEX "music_media_entity_type_src_unique" ON "music_media" USING btree ("music_id","media_type","src");--> statement-breakpoint
CREATE UNIQUE INDEX "producer_media_entity_type_src_unique" ON "producer_media" USING btree ("producer_id","media_type","src");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_media_entity_type_src_unique" ON "staff_media" USING btree ("staff_id","media_type","src");