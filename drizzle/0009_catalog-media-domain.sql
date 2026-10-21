CREATE TABLE "anime_external_link" (
	"id" serial PRIMARY KEY NOT NULL,
	"anime_id" integer NOT NULL,
	"site" text NOT NULL,
	"url" text NOT NULL,
	"type" text,
	"icon" text
);
--> statement-breakpoint
CREATE TABLE "manga_external_link" (
	"id" serial PRIMARY KEY NOT NULL,
	"manga_id" integer NOT NULL,
	"site" text NOT NULL,
	"url" text NOT NULL,
	"type" text,
	"icon" text
);
--> statement-breakpoint
CREATE TABLE "manga" (
	"mal_id" integer PRIMARY KEY NOT NULL,
	"type" text DEFAULT 'manga' NOT NULL,
	"title" text NOT NULL,
	"title_english" text,
	"title_japanese" text,
	"status" text,
	"chapters" integer,
	"volumes" integer,
	"score" real,
	"scored_by" integer,
	"popularity_rank" integer,
	"ranking" integer,
	"members" integer,
	"favorites" integer,
	"year" integer,
	"synopsis" text,
	"background" text,
	"source" text,
	"serialization" text,
	"country_of_origin" text,
	"duration" text,
	"published_from" timestamp with time zone,
	"published_to" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "manga_title_synonym" (
	"id" serial PRIMARY KEY NOT NULL,
	"manga_id" integer NOT NULL,
	"title" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manga_external_ids" (
	"manga_id" integer PRIMARY KEY NOT NULL,
	"anilist_id" integer,
	"kitsu_id" integer,
	"tvdb_id" integer,
	"anilist_site_id" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manga_character" (
	"manga_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "manga_character_manga_id_character_id_role_pk" PRIMARY KEY("manga_id","character_id","role")
);
--> statement-breakpoint
CREATE TABLE "manga_demographic" (
	"manga_id" integer NOT NULL,
	"demographic_id" integer NOT NULL,
	CONSTRAINT "manga_demographic_manga_id_demographic_id_pk" PRIMARY KEY("manga_id","demographic_id")
);
--> statement-breakpoint
CREATE TABLE "manga_genre" (
	"manga_id" integer NOT NULL,
	"genre_id" integer NOT NULL,
	CONSTRAINT "manga_genre_manga_id_genre_id_pk" PRIMARY KEY("manga_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "manga_producer" (
	"manga_id" integer NOT NULL,
	"producer_id" integer NOT NULL,
	"role" text DEFAULT 'publisher' NOT NULL,
	CONSTRAINT "manga_producer_manga_id_producer_id_role_pk" PRIMARY KEY("manga_id","producer_id","role")
);
--> statement-breakpoint
CREATE TABLE "manga_relation" (
	"manga_id" integer NOT NULL,
	"related_manga_id" integer NOT NULL,
	"relation_type" text NOT NULL,
	CONSTRAINT "manga_relation_manga_id_related_manga_id_relation_type_pk" PRIMARY KEY("manga_id","related_manga_id","relation_type")
);
--> statement-breakpoint
CREATE TABLE "manga_staff" (
	"manga_id" integer NOT NULL,
	"staff_id" integer NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "manga_staff_manga_id_staff_id_role_pk" PRIMARY KEY("manga_id","staff_id","role")
);
--> statement-breakpoint
CREATE TABLE "manga_theme" (
	"manga_id" integer NOT NULL,
	"theme_id" integer NOT NULL,
	CONSTRAINT "manga_theme_manga_id_theme_id_pk" PRIMARY KEY("manga_id","theme_id")
);
--> statement-breakpoint
CREATE TABLE "manga_media" (
	"id" serial PRIMARY KEY NOT NULL,
	"manga_id" integer NOT NULL,
	"media_type" text NOT NULL,
	"src" text NOT NULL,
	"size" text,
	"source" text,
	"priority" integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "anilist_id" integer;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "date_of_birth" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "blood_type" text;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "weight" integer;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "age" text;--> statement-breakpoint
ALTER TABLE "character" ADD COLUMN "favorites" integer;--> statement-breakpoint
ALTER TABLE "music" ADD COLUMN "album" text;--> statement-breakpoint
ALTER TABLE "music" ADD COLUMN "duration" integer;--> statement-breakpoint
ALTER TABLE "music" ADD COLUMN "release_date" date;--> statement-breakpoint
ALTER TABLE "music" ADD COLUMN "lyrics" text;--> statement-breakpoint
ALTER TABLE "music" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "anilist_id" integer;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "date_of_birth" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "favorites" integer;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "voice_actor_mal_id" integer;--> statement-breakpoint
ALTER TABLE "anime_external_link" ADD CONSTRAINT "anime_external_link_anime_id_anime_mal_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_external_link" ADD CONSTRAINT "manga_external_link_manga_id_manga_mal_id_fk" FOREIGN KEY ("manga_id") REFERENCES "public"."manga"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_title_synonym" ADD CONSTRAINT "manga_title_synonym_manga_id_manga_mal_id_fk" FOREIGN KEY ("manga_id") REFERENCES "public"."manga"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_external_ids" ADD CONSTRAINT "manga_external_ids_manga_id_manga_mal_id_fk" FOREIGN KEY ("manga_id") REFERENCES "public"."manga"("mal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_character" ADD CONSTRAINT "manga_character_manga_id_manga_mal_id_fk" FOREIGN KEY ("manga_id") REFERENCES "public"."manga"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_character" ADD CONSTRAINT "manga_character_character_id_character_mal_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_demographic" ADD CONSTRAINT "manga_demographic_manga_id_manga_mal_id_fk" FOREIGN KEY ("manga_id") REFERENCES "public"."manga"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_demographic" ADD CONSTRAINT "manga_demographic_demographic_id_demographic_mal_id_fk" FOREIGN KEY ("demographic_id") REFERENCES "public"."demographic"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_genre" ADD CONSTRAINT "manga_genre_manga_id_manga_mal_id_fk" FOREIGN KEY ("manga_id") REFERENCES "public"."manga"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_genre" ADD CONSTRAINT "manga_genre_genre_id_genre_mal_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genre"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_producer" ADD CONSTRAINT "manga_producer_manga_id_manga_mal_id_fk" FOREIGN KEY ("manga_id") REFERENCES "public"."manga"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_producer" ADD CONSTRAINT "manga_producer_producer_id_producer_mal_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."producer"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_relation" ADD CONSTRAINT "manga_relation_manga_id_manga_mal_id_fk" FOREIGN KEY ("manga_id") REFERENCES "public"."manga"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_relation" ADD CONSTRAINT "manga_relation_related_manga_id_manga_mal_id_fk" FOREIGN KEY ("related_manga_id") REFERENCES "public"."manga"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_staff" ADD CONSTRAINT "manga_staff_manga_id_manga_mal_id_fk" FOREIGN KEY ("manga_id") REFERENCES "public"."manga"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_staff" ADD CONSTRAINT "manga_staff_staff_id_staff_mal_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_theme" ADD CONSTRAINT "manga_theme_manga_id_manga_mal_id_fk" FOREIGN KEY ("manga_id") REFERENCES "public"."manga"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_theme" ADD CONSTRAINT "manga_theme_theme_id_theme_mal_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."theme"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manga_media" ADD CONSTRAINT "manga_media_manga_id_manga_mal_id_fk" FOREIGN KEY ("manga_id") REFERENCES "public"."manga"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anime_external_link_anime_id_url_unique" ON "anime_external_link" USING btree ("anime_id","url");--> statement-breakpoint
CREATE INDEX "anime_external_link_site_idx" ON "anime_external_link" USING btree ("site");--> statement-breakpoint
CREATE UNIQUE INDEX "manga_external_link_manga_id_url_unique" ON "manga_external_link" USING btree ("manga_id","url");--> statement-breakpoint
CREATE INDEX "manga_external_link_site_idx" ON "manga_external_link" USING btree ("site");--> statement-breakpoint
CREATE INDEX "manga_year_idx" ON "manga" USING btree ("year");--> statement-breakpoint
CREATE INDEX "manga_type_idx" ON "manga" USING btree ("type");--> statement-breakpoint
CREATE INDEX "manga_score_idx" ON "manga" USING btree ("score");--> statement-breakpoint
CREATE INDEX "manga_status_idx" ON "manga" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "manga_title_synonym_manga_id_title_idx" ON "manga_title_synonym" USING btree ("manga_id","title");--> statement-breakpoint
CREATE INDEX "manga_title_synonym_title_trgm_idx" ON "manga_title_synonym" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "manga_character_character_id_idx" ON "manga_character" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "manga_producer_role_idx" ON "manga_producer" USING btree ("role","producer_id");--> statement-breakpoint
CREATE INDEX "manga_relation_related_manga_id_idx" ON "manga_relation" USING btree ("related_manga_id");--> statement-breakpoint
CREATE INDEX "manga_staff_staff_id_idx" ON "manga_staff" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "manga_media_manga_id_type_priority_idx" ON "manga_media" USING btree ("manga_id","media_type","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "manga_media_entity_type_src_unique" ON "manga_media" USING btree ("manga_id","media_type","src");