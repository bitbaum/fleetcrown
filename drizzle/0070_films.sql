-- Migration: films — a screenplay, the shots it is cut into, and the cut.
--
-- Written by hand rather than generated, matching 0064 through 0069:
-- `drizzle-kit generate` stops on an interactive rename prompt that predates
-- this change (site_feedback.screenshot → screenshots), and apply-schema.sh
-- globs numbered .sql files rather than reading the journal — so a generated
-- file would have carried an unrelated pending rename into this migration.
--
-- ADDITIVE. Three new tables, nothing else touched. Nothing outside /films
-- reads them, so dropping all three would cost only the film feature.
--
-- WHY THREE TABLES AND NOT ONE JSONB COLUMN
--
-- A shot is the unit of work here: it is generated on its own, it succeeds or
-- fails on its own, and it acquires a clip URL and a status of its own. That is
-- a row. Scenes are separate from shots because a scene owns the location and
-- the time of day, which every shot inside it has to restate in its prompt —
-- denormalising that onto the shot would mean fixing a mistyped location in
-- eleven places.

CREATE TABLE IF NOT EXISTS "films" (
  "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"                uuid NOT NULL,
  "title"                  text NOT NULL,
  "logline"                text,
  -- The idea as typed. Input to the screenplay, never to a shot prompt.
  "premise"                text,
  -- What actually gets broken down.
  "screenplay"             text,
  -- The look. Restated in EVERY generated shot prompt, because a video model
  -- sees one clip at a time and remembers nothing between them.
  "style_bible"            text,
  "status"                 text NOT NULL DEFAULT 'draft',
  "aspect_ratio"           text NOT NULL DEFAULT '16:9',
  -- A SNAPSHOT of the clip ceiling this film's shots were sliced against, not a
  -- live read of the config. When a model raises its limit and the env var
  -- follows, a film already half-generated must not silently acquire a shot
  -- list that disagrees with the clips sitting against it.
  --
  -- NUMERIC(6,2), not an integer: the slicer splits evenly, so a 25s beat under
  -- an 8s ceiling is four 6.25s shots, and whole seconds cannot express that.
  "max_clip_seconds"       numeric(6, 2) NOT NULL DEFAULT 8,
  "target_runtime_seconds" integer,
  "broken_down_at"         timestamp with time zone,
  "created_at"             timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"             timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "film_scenes" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "film_id"      uuid NOT NULL,
  "user_id"      uuid NOT NULL,
  -- 1-based within the film.
  "ordinal"      integer NOT NULL,
  -- The slugline, verbatim: "INT. KITCHEN - NIGHT".
  "heading"      text,
  "synopsis"     text,
  "location"     text,
  "time_of_day"  text,
  "created_at"   timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "film_shots" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "film_id"          uuid NOT NULL,
  "scene_id"         uuid,
  "user_id"          uuid NOT NULL,
  -- 1-based and GLOBAL across the film, not per scene: this is the cut order,
  -- the clip file name (shot-007.mp4), and the thing an operator says out loud
  -- when a take is wrong. Per-scene numbering would make all three ambiguous.
  "ordinal"          integer NOT NULL,
  "description"      text NOT NULL,
  "dialogue"         text,
  -- What must match the shot before this one.
  "continuity"       text,
  "shot_size"        text NOT NULL,
  "camera_move"      text NOT NULL,
  -- See max_clip_seconds above for why this is not an integer.
  "duration_seconds" numeric(6, 2) NOT NULL,
  -- Set when this shot is piece N of one action too long to render in one go.
  "part_index"       integer,
  "part_total"       integer,
  -- A human's edit of the generated prompt. Wins over the composer, always.
  "prompt_override"  text,
  -- Where the rendered clip lives. Stored; never fetched by the server.
  "clip_url"         text,
  "status"           text NOT NULL DEFAULT 'planned',
  "created_at"       timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"       timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Deleting a film takes its scenes and shots with it; deleting a scene takes
-- its shots. A shot with no film is a prompt for a picture nobody ordered.
DO $$ BEGIN
  ALTER TABLE "films" ADD CONSTRAINT "films_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "film_scenes" ADD CONSTRAINT "film_scenes_film_id_films_id_fk"
    FOREIGN KEY ("film_id") REFERENCES "public"."films"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "film_scenes" ADD CONSTRAINT "film_scenes_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "film_shots" ADD CONSTRAINT "film_shots_film_id_films_id_fk"
    FOREIGN KEY ("film_id") REFERENCES "public"."films"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "film_shots" ADD CONSTRAINT "film_shots_scene_id_film_scenes_id_fk"
    FOREIGN KEY ("scene_id") REFERENCES "public"."film_scenes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "film_shots" ADD CONSTRAINT "film_shots_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_films_user_id"      ON "films" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_films_user_status"  ON "films" ("user_id", "status");--> statement-breakpoint
-- The list page orders by most recently touched.
CREATE INDEX IF NOT EXISTS "idx_films_updated"      ON "films" ("user_id", "updated_at");--> statement-breakpoint

-- Scenes and shots are always read in order, for one film.
CREATE INDEX IF NOT EXISTS "idx_film_scenes_film"   ON "film_scenes" ("film_id", "ordinal");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_film_scenes_user"   ON "film_scenes" ("user_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_film_shots_film"        ON "film_shots" ("film_id", "ordinal");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_film_shots_scene"       ON "film_shots" ("scene_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_film_shots_user"        ON "film_shots" ("user_id");--> statement-breakpoint
-- Progress counts on the list page: how many of this film's shots have a take.
CREATE INDEX IF NOT EXISTS "idx_film_shots_film_status" ON "film_shots" ("film_id", "status");
