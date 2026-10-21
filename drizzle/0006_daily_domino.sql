CREATE TABLE "music_stream" (
	"id" serial PRIMARY KEY NOT NULL,
	"music_id" integer NOT NULL,
	"provider" text NOT NULL,
	"url" text NOT NULL,
	"external_id" text,
	"country" text
);
--> statement-breakpoint
ALTER TABLE "music_stream" ADD CONSTRAINT "music_stream_music_id_music_id_fk" FOREIGN KEY ("music_id") REFERENCES "public"."music"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "music_stream_music_provider_unique" ON "music_stream" USING btree ("music_id","provider");--> statement-breakpoint
CREATE INDEX "music_stream_music_id_idx" ON "music_stream" USING btree ("music_id");