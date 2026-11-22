CREATE TABLE "character_external" (
	"character_id" integer PRIMARY KEY NOT NULL,
	"mal_id" integer,
	"anilist_id" integer,
	"anidb_id" integer,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character_external" ADD CONSTRAINT "character_external_character_id_character_mal_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "character_external_mal_id_unique" ON "character_external" USING btree ("mal_id") WHERE "character_external"."mal_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "character_external_anilist_id_unique" ON "character_external" USING btree ("anilist_id") WHERE "character_external"."anilist_id" IS NOT NULL;