import { pgTable, uuid, text, integer, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import {
  CLIP,
  DEFAULT_ASPECT_RATIO,
  FILM_STATUS,
  SHOT_STATUS,
  type FilmStatus,
  type ShotStatus,
  type CameraMove,
  type ShotSize,
} from "@/config/film";

/**
 * A film — the premise, the screenplay, and the house style every shot inherits.
 *
 * Three text columns that look similar and are not. `premise` is what the
 * person typed; `screenplay` is what gets broken down; `styleBible` is the only
 * one that reaches EVERY generated prompt. Keeping them apart is what lets the
 * operator rewrite the look without touching the story, which is the edit they
 * make most — the first shot comes back looking like a stock video and the fix
 * is one field, not forty prompts.
 *
 * `maxClipSeconds` is a SNAPSHOT of the ceiling the shot list was built against,
 * not a live read of the config. When a model raises its limit and the env var
 * follows, a film already half-generated must not silently acquire a shot list
 * that disagrees with the clips sitting against it — the operator re-runs the
 * breakdown when they choose to, and until then this column says what the
 * existing shots actually assume.
 */
export const films = pgTable(
  "films",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    logline: text("logline"),
    /** The idea, as typed. Input to the screenplay, never to a shot prompt. */
    premise: text("premise"),
    /** What actually gets broken down — written here or pasted in. */
    screenplay: text("screenplay"),
    /** The look. Restated in every single shot prompt; the model has no memory. */
    styleBible: text("style_bible"),

    status: text("status").$type<FilmStatus>().notNull().default(FILM_STATUS.DRAFT),

    aspectRatio: text("aspect_ratio").notNull().default(DEFAULT_ASPECT_RATIO),
    /** The ceiling this film's shots were sliced against. See the note above. */
    maxClipSeconds: numeric("max_clip_seconds", { precision: 6, scale: 2, mode: "number" })
      .notNull()
      .default(CLIP.DEFAULT_MAX_SECONDS),
    /** What the writer is aiming for. Advisory — the cut is what the shots add to. */
    targetRuntimeSeconds: integer("target_runtime_seconds"),

    brokenDownAt: timestamp("broken_down_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_films_user_id").on(t.userId),
    index("idx_films_user_status").on(t.userId, t.status),
    index("idx_films_updated").on(t.userId, t.updatedAt),
  ],
);

/**
 * A scene — one place, one stretch of time, as the screenplay's slugline says.
 *
 * Scenes exist as rows rather than as a grouping key on the shot because they
 * carry what every shot inside them needs restated: the location and the time
 * of day. Denormalising that onto each shot would mean correcting a mistyped
 * location in eleven places.
 */
export const filmScenes = pgTable(
  "film_scenes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    filmId: uuid("film_id")
      .notNull()
      .references(() => films.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** 1-based order within the film. */
    ordinal: integer("ordinal").notNull(),
    /** The slugline, verbatim: "INT. KITCHEN - NIGHT". */
    heading: text("heading"),
    synopsis: text("synopsis"),
    location: text("location"),
    timeOfDay: text("time_of_day"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_film_scenes_film").on(t.filmId, t.ordinal),
    index("idx_film_scenes_user").on(t.userId),
  ],
);

/**
 * A shot — one clip, one generation, guaranteed to fit under the film's ceiling.
 *
 * `ordinal` is global across the film, not per scene, because it is the cut
 * order, the file name (shot-007.mp4) and the thing an operator says out loud
 * when a take is wrong. Per-scene numbering would make all three ambiguous.
 *
 * `partIndex`/`partTotal` record that this shot is one piece of a single action
 * too long to render in one go. It is not decoration: those pieces must open on
 * exactly the frame the previous one closed on, and an operator regenerating
 * shot 12 needs to know it is the middle of something, not a fresh setup.
 *
 * `promptOverride` beats the composed prompt, always. Somebody who has watched
 * a take fail knows something the composer does not, and their edit must
 * survive every later re-render.
 */
export const filmShots = pgTable(
  "film_shots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    filmId: uuid("film_id")
      .notNull()
      .references(() => films.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id").references(() => filmScenes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** 1-based, global across the film. Cut order and file name. */
    ordinal: integer("ordinal").notNull(),
    description: text("description").notNull(),
    dialogue: text("dialogue"),
    /** What must match the shot before this one. */
    continuity: text("continuity"),

    shotSize: text("shot_size").$type<ShotSize>().notNull(),
    cameraMove: text("camera_move").$type<CameraMove>().notNull(),
    /**
     * NUMERIC(6,2) rather than an integer: the slicer splits evenly, so a 25s
     * beat under an 8s ceiling is four 6.25s shots. Rounding those to whole
     * seconds would add a second of runtime per beat and desynchronise the cut
     * from the edit list.
     */
    durationSeconds: numeric("duration_seconds", {
      precision: 6,
      scale: 2,
      mode: "number",
    }).notNull(),

    /** Set when this shot is piece N of one continuous action. */
    partIndex: integer("part_index"),
    partTotal: integer("part_total"),

    /** A human's edit of the generated prompt. Wins over the composer. */
    promptOverride: text("prompt_override"),
    /** Where the rendered clip lives. The pipeline stores it; it never fetches it. */
    clipUrl: text("clip_url"),

    status: text("status").$type<ShotStatus>().notNull().default(SHOT_STATUS.PLANNED),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_film_shots_film").on(t.filmId, t.ordinal),
    index("idx_film_shots_scene").on(t.sceneId),
    index("idx_film_shots_user").on(t.userId),
    index("idx_film_shots_film_status").on(t.filmId, t.status),
  ],
);

export type Film = typeof films.$inferSelect;
export type NewFilm = typeof films.$inferInsert;
export type FilmScene = typeof filmScenes.$inferSelect;
export type NewFilmScene = typeof filmScenes.$inferInsert;
export type FilmShot = typeof filmShots.$inferSelect;
export type NewFilmShot = typeof filmShots.$inferInsert;
