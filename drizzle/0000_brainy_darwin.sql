CREATE SCHEMA "ingest";
--> statement-breakpoint
CREATE TABLE "anime" (
	"mal_id" integer PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"title_english" text,
	"title_japanese" text,
	"type" text,
	"status" text,
	"episodes" integer,
	"score" real,
	"scored_by" integer,
	"popularity_rank" integer,
	"rating" text,
	"year" integer,
	"season" text,
	"synopsis" text,
	"background" text
);
--> statement-breakpoint
CREATE TABLE "anime_title_synonym" (
	"id" serial PRIMARY KEY NOT NULL,
	"anime_id" integer NOT NULL,
	"title" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anime_external_ids" (
	"anime_id" integer PRIMARY KEY NOT NULL,
	"anime_themes_slug" text,
	"kitsu_id" integer,
	"tvdb_id" integer,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anime_character" (
	"anime_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "anime_character_anime_id_character_id_role_pk" PRIMARY KEY("anime_id","character_id","role")
);
--> statement-breakpoint
CREATE TABLE "anime_demographic" (
	"anime_id" integer NOT NULL,
	"demographic_id" integer NOT NULL,
	CONSTRAINT "anime_demographic_anime_id_demographic_id_pk" PRIMARY KEY("anime_id","demographic_id")
);
--> statement-breakpoint
CREATE TABLE "anime_genre" (
	"anime_id" integer NOT NULL,
	"genre_id" integer NOT NULL,
	CONSTRAINT "anime_genre_anime_id_genre_id_pk" PRIMARY KEY("anime_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "anime_music" (
	"anime_id" integer NOT NULL,
	"music_id" integer NOT NULL,
	CONSTRAINT "anime_music_anime_id_music_id_pk" PRIMARY KEY("anime_id","music_id")
);
--> statement-breakpoint
CREATE TABLE "anime_producer" (
	"anime_id" integer NOT NULL,
	"producer_id" integer NOT NULL,
	CONSTRAINT "anime_producer_anime_id_producer_id_pk" PRIMARY KEY("anime_id","producer_id")
);
--> statement-breakpoint
CREATE TABLE "anime_relation" (
	"anime_id" integer NOT NULL,
	"relation_type" text NOT NULL,
	"related_anime_id" integer NOT NULL,
	CONSTRAINT "anime_relation_anime_id_related_anime_id_relation_type_pk" PRIMARY KEY("anime_id","related_anime_id","relation_type")
);
--> statement-breakpoint
CREATE TABLE "anime_staff" (
	"anime_id" integer NOT NULL,
	"staff_id" integer NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "anime_staff_anime_id_staff_id_role_pk" PRIMARY KEY("anime_id","staff_id","role")
);
--> statement-breakpoint
CREATE TABLE "anime_theme" (
	"anime_id" integer NOT NULL,
	"theme_id" integer NOT NULL,
	CONSTRAINT "anime_theme_anime_id_theme_id_pk" PRIMARY KEY("anime_id","theme_id")
);
--> statement-breakpoint
CREATE TABLE "demographic" (
	"mal_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "genre" (
	"mal_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theme" (
	"mal_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"mal_id" integer
);
--> statement-breakpoint
CREATE TABLE "character" (
	"mal_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_kanji" text,
	"about" text
);
--> statement-breakpoint
CREATE TABLE "character_nickname" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"nickname" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_voice_actor" (
	"character_id" integer NOT NULL,
	"staff_id" integer NOT NULL,
	"language" text NOT NULL,
	CONSTRAINT "character_voice_actor_character_id_staff_id_language_pk" PRIMARY KEY("character_id","staff_id","language")
);
--> statement-breakpoint
CREATE TABLE "episode" (
	"id" serial PRIMARY KEY NOT NULL,
	"anime_id" integer NOT NULL,
	"title" text NOT NULL,
	"synopsis" text,
	"duration" text,
	"aired" text,
	"number" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_source" (
	"id" serial PRIMARY KEY NOT NULL,
	"episode_id" integer NOT NULL,
	"src" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_subtitle" (
	"id" serial PRIMARY KEY NOT NULL,
	"episode_id" integer NOT NULL,
	"language" text NOT NULL,
	"src" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest"."run" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"mode" text DEFAULT 'incremental' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"tasks_processed" integer DEFAULT 0 NOT NULL,
	"tasks_retried" integer DEFAULT 0 NOT NULL,
	"tasks_blocked" integer DEFAULT 0 NOT NULL,
	"tasks_dead_lettered" integer DEFAULT 0 NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "ingest"."task" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"task_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"payload" jsonb,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"leased_until" timestamp with time zone,
	"last_scraped_at" timestamp with time zone,
	"refresh_after" timestamp with time zone,
	"last_error" text,
	"skip_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest"."task_policy" (
	"source" text NOT NULL,
	"task_type" text NOT NULL,
	"refresh_interval_seconds" integer,
	"refresh_interval_airing_seconds" integer,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "task_policy_source_task_type_pk" PRIMARY KEY("source","task_type")
);
--> statement-breakpoint
CREATE TABLE "anime_media" (
	"id" serial PRIMARY KEY NOT NULL,
	"anime_id" integer NOT NULL,
	"media_type" text NOT NULL,
	"src" text NOT NULL,
	"size" text
);
--> statement-breakpoint
CREATE TABLE "character_media" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"media_type" text NOT NULL,
	"src" text NOT NULL,
	"size" text
);
--> statement-breakpoint
CREATE TABLE "episode_media" (
	"id" serial PRIMARY KEY NOT NULL,
	"episode_id" integer NOT NULL,
	"media_type" text NOT NULL,
	"src" text NOT NULL,
	"size" text
);
--> statement-breakpoint
CREATE TABLE "music_media" (
	"id" serial PRIMARY KEY NOT NULL,
	"music_id" integer NOT NULL,
	"media_type" text NOT NULL,
	"src" text NOT NULL,
	"size" text
);
--> statement-breakpoint
CREATE TABLE "producer_media" (
	"id" serial PRIMARY KEY NOT NULL,
	"producer_id" integer NOT NULL,
	"media_type" text NOT NULL,
	"src" text NOT NULL,
	"size" text
);
--> statement-breakpoint
CREATE TABLE "staff_media" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"media_type" text NOT NULL,
	"src" text NOT NULL,
	"size" text
);
--> statement-breakpoint
CREATE TABLE "music" (
	"id" integer PRIMARY KEY NOT NULL,
	"title" text,
	"type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "music_resolution" (
	"id" serial PRIMARY KEY NOT NULL,
	"music_version_id" integer NOT NULL,
	"song_id" integer NOT NULL,
	"resolution" text NOT NULL,
	"audio_url" text,
	"video_url" text
);
--> statement-breakpoint
CREATE TABLE "music_version" (
	"id" serial PRIMARY KEY NOT NULL,
	"music_id" integer NOT NULL,
	"version" integer NOT NULL,
	"version_id" integer NOT NULL,
	CONSTRAINT "music_version_version_id_unique" UNIQUE("version_id")
);
--> statement-breakpoint
CREATE TABLE "music_artist" (
	"music_id" integer NOT NULL,
	"artist_id" integer NOT NULL,
	CONSTRAINT "music_artist_music_id_artist_id_pk" PRIMARY KEY("music_id","artist_id")
);
--> statement-breakpoint
CREATE TABLE "producer" (
	"mal_id" integer PRIMARY KEY NOT NULL,
	"established" text,
	"about" text,
	"count" integer
);
--> statement-breakpoint
CREATE TABLE "producer_title" (
	"id" serial PRIMARY KEY NOT NULL,
	"producer_id" integer NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"mal_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"given_name" text,
	"family_name" text,
	"birthday" text,
	"about" text
);
--> statement-breakpoint
CREATE TABLE "staff_alternative_name" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anime_title_synonym" ADD CONSTRAINT "anime_title_synonym_anime_id_anime_mal_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_external_ids" ADD CONSTRAINT "anime_external_ids_anime_id_anime_mal_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("mal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_character" ADD CONSTRAINT "anime_character_anime_id_anime_mal_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_character" ADD CONSTRAINT "anime_character_character_id_character_mal_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_demographic" ADD CONSTRAINT "anime_demographic_anime_id_anime_mal_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_demographic" ADD CONSTRAINT "anime_demographic_demographic_id_demographic_mal_id_fk" FOREIGN KEY ("demographic_id") REFERENCES "public"."demographic"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_genre" ADD CONSTRAINT "anime_genre_anime_id_anime_mal_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_genre" ADD CONSTRAINT "anime_genre_genre_id_genre_mal_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genre"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_music" ADD CONSTRAINT "anime_music_anime_id_anime_mal_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_music" ADD CONSTRAINT "anime_music_music_id_music_id_fk" FOREIGN KEY ("music_id") REFERENCES "public"."music"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_producer" ADD CONSTRAINT "anime_producer_anime_id_anime_mal_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_producer" ADD CONSTRAINT "anime_producer_producer_id_producer_mal_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."producer"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_relation" ADD CONSTRAINT "anime_relation_anime_id_anime_mal_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_relation" ADD CONSTRAINT "anime_relation_related_anime_id_anime_mal_id_fk" FOREIGN KEY ("related_anime_id") REFERENCES "public"."anime"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_staff" ADD CONSTRAINT "anime_staff_anime_id_anime_mal_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_staff" ADD CONSTRAINT "anime_staff_staff_id_staff_mal_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_theme" ADD CONSTRAINT "anime_theme_anime_id_anime_mal_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_theme" ADD CONSTRAINT "anime_theme_theme_id_theme_mal_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."theme"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist" ADD CONSTRAINT "artist_mal_id_staff_mal_id_fk" FOREIGN KEY ("mal_id") REFERENCES "public"."staff"("mal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_nickname" ADD CONSTRAINT "character_nickname_character_id_character_mal_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_voice_actor" ADD CONSTRAINT "character_voice_actor_character_id_character_mal_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_voice_actor" ADD CONSTRAINT "character_voice_actor_staff_id_staff_mal_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode" ADD CONSTRAINT "episode_anime_id_anime_mal_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_source" ADD CONSTRAINT "episode_source_episode_id_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episode"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_subtitle" ADD CONSTRAINT "episode_subtitle_episode_id_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episode"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_media" ADD CONSTRAINT "anime_media_anime_id_anime_mal_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_media" ADD CONSTRAINT "character_media_character_id_character_mal_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_media" ADD CONSTRAINT "episode_media_episode_id_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episode"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_media" ADD CONSTRAINT "music_media_music_id_music_id_fk" FOREIGN KEY ("music_id") REFERENCES "public"."music"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producer_media" ADD CONSTRAINT "producer_media_producer_id_producer_mal_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."producer"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_media" ADD CONSTRAINT "staff_media_staff_id_staff_mal_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_resolution" ADD CONSTRAINT "music_resolution_music_version_id_music_version_version_id_fk" FOREIGN KEY ("music_version_id") REFERENCES "public"."music_version"("version_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_version" ADD CONSTRAINT "music_version_music_id_music_id_fk" FOREIGN KEY ("music_id") REFERENCES "public"."music"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_artist" ADD CONSTRAINT "music_artist_music_id_music_id_fk" FOREIGN KEY ("music_id") REFERENCES "public"."music"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_artist" ADD CONSTRAINT "music_artist_artist_id_artist_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producer_title" ADD CONSTRAINT "producer_title_producer_id_producer_mal_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."producer"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_alternative_name" ADD CONSTRAINT "staff_alternative_name_staff_id_staff_mal_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("mal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anime_year_idx" ON "anime" USING btree ("year");--> statement-breakpoint
CREATE INDEX "anime_season_idx" ON "anime" USING btree ("season");--> statement-breakpoint
CREATE INDEX "anime_score_idx" ON "anime" USING btree ("score");--> statement-breakpoint
CREATE INDEX "anime_status_idx" ON "anime" USING btree ("status");--> statement-breakpoint
CREATE INDEX "anime_type_idx" ON "anime" USING btree ("type");--> statement-breakpoint
CREATE INDEX "anime_rating_idx" ON "anime" USING btree ("rating");--> statement-breakpoint
CREATE UNIQUE INDEX "anime_title_synonym_anime_id_title_idx" ON "anime_title_synonym" USING btree ("anime_id","title");--> statement-breakpoint
CREATE INDEX "anime_title_synonym_title_trgm_idx" ON "anime_title_synonym" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "genre_name_idx" ON "genre" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "artist_name_unique" ON "artist" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "character_nickname_unique" ON "character_nickname" USING btree ("character_id","nickname");--> statement-breakpoint
CREATE UNIQUE INDEX "episode_anime_number_unique" ON "episode" USING btree ("anime_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "episode_source_unique" ON "episode_source" USING btree ("episode_id","src");--> statement-breakpoint
CREATE UNIQUE INDEX "episode_subtitle_unique" ON "episode_subtitle" USING btree ("episode_id","language","src");--> statement-breakpoint
CREATE UNIQUE INDEX "ingest_task_identity_unique" ON "ingest"."task" USING btree ("source","task_type","entity_id");--> statement-breakpoint
CREATE INDEX "ingest_task_due_idx" ON "ingest"."task" USING btree ("status","priority","scheduled_at");--> statement-breakpoint
CREATE INDEX "ingest_task_lease_idx" ON "ingest"."task" USING btree ("status","leased_until");--> statement-breakpoint
CREATE INDEX "anime_media_anime_id_type_idx" ON "anime_media" USING btree ("anime_id","media_type");--> statement-breakpoint
CREATE INDEX "character_media_character_id_type_idx" ON "character_media" USING btree ("character_id","media_type");--> statement-breakpoint
CREATE INDEX "episode_media_episode_id_type_idx" ON "episode_media" USING btree ("episode_id","media_type");--> statement-breakpoint
CREATE INDEX "music_media_music_id_type_idx" ON "music_media" USING btree ("music_id","media_type");--> statement-breakpoint
CREATE INDEX "staff_media_staff_id_type_idx" ON "staff_media" USING btree ("staff_id","media_type");--> statement-breakpoint
CREATE UNIQUE INDEX "music_resolution_song_res_unique" ON "music_resolution" USING btree ("song_id","resolution");--> statement-breakpoint
CREATE INDEX "music_resolution_version_id_idx" ON "music_resolution" USING btree ("music_version_id");--> statement-breakpoint
CREATE INDEX "music_version_music_id_idx" ON "music_version" USING btree ("music_id");--> statement-breakpoint
CREATE UNIQUE INDEX "producer_title_unique" ON "producer_title" USING btree ("producer_id","title");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_alt_name_unique" ON "staff_alternative_name" USING btree ("staff_id","name");