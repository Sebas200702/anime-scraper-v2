-- Esquema de ingesta (`ingest.*`) — DDL idempotente.
--
-- El dueño "oficial" del DDL es anidev-v2. Mientras ese change no aterrice en
-- su release, el scraper crea el schema en la Postgres de producción con este
-- archivo (el contenedor lo aplica en el arranque). Solo crea `ingest.*`: NO
-- toca las tablas del catálogo, que son de la app.
--
-- `IF NOT EXISTS` en todo: correrlo N veces es seguro.

CREATE SCHEMA IF NOT EXISTS "ingest";

CREATE TABLE IF NOT EXISTS "ingest"."task" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "ingest_task_identity_unique"
  ON "ingest"."task" USING btree ("source", "task_type", "entity_id");

CREATE INDEX IF NOT EXISTS "ingest_task_due_idx"
  ON "ingest"."task" USING btree ("status", "priority", "scheduled_at");

CREATE INDEX IF NOT EXISTS "ingest_task_lease_idx"
  ON "ingest"."task" USING btree ("status", "leased_until");

CREATE TABLE IF NOT EXISTS "ingest"."task_policy" (
  "source" text NOT NULL,
  "task_type" text NOT NULL,
  "refresh_interval_seconds" integer,
  "refresh_interval_airing_seconds" integer,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "task_policy_source_task_type_pk" PRIMARY KEY ("source", "task_type")
);

CREATE TABLE IF NOT EXISTS "ingest"."run" (
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
