/**
 * Film data access.
 *
 * The one operation with any weight is `replaceBreakdown`, which swaps a film's
 * entire scene and shot list for a new one. It runs in a transaction because a
 * half-replaced shot list is worse than either the old one or the new one: the
 * ordinals are the cut order, and a film with two shot 7s is a film whose edit
 * list is a lie.
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  films,
  filmScenes,
  filmShots,
  type Film,
  type FilmScene,
  type FilmShot,
} from "@/db/schema";
import {
  FILM_STATUS,
  SHOT_STATUS,
  clampClipSeconds,
  isUsableShot,
  type CreateFilmInput,
  type FilmStatus,
  type PatchFilmInput,
  type PatchShotInput,
} from "@/config/film";
import type { BrokenDownScene } from "@/lib/film/breakdown";
import { planShots } from "@/lib/film/slice";

/** A film as the list page needs it — the row, plus how far along it is. */
export type FilmRow = Film & {
  shotCount: number;
  readyShotCount: number;
  plannedRuntimeSeconds: number;
};

export type FilmDetail = {
  film: Film;
  scenes: FilmScene[];
  shots: FilmShot[];
};

export async function listFilms(userId: string): Promise<FilmRow[]> {
  const rows = await db
    .select()
    .from(films)
    .where(eq(films.userId, userId))
    .orderBy(desc(films.updatedAt));
  if (rows.length === 0) return [];

  const counts = await db
    .select({
      filmId: filmShots.filmId,
      shotCount: sql<number>`count(*)::int`,
      plannedRuntimeSeconds: sql<number>`coalesce(sum(${filmShots.durationSeconds}), 0)::float8`,
      // Mirrors isUsableShot() — a clip the operator kept. Counted in SQL rather
      // than by loading every shot, so the list page stays one query.
      readyShotCount: sql<number>`count(*) filter (
        where ${filmShots.clipUrl} is not null
          and ${filmShots.status} in (${SHOT_STATUS.APPROVED}, ${SHOT_STATUS.GENERATED})
      )::int`,
    })
    .from(filmShots)
    .where(
      inArray(
        filmShots.filmId,
        rows.map((r) => r.id),
      ),
    )
    .groupBy(filmShots.filmId);

  const byFilm = new Map(counts.map((c) => [c.filmId, c]));
  return rows.map((film) => {
    const c = byFilm.get(film.id);
    return {
      ...film,
      shotCount: c?.shotCount ?? 0,
      readyShotCount: c?.readyShotCount ?? 0,
      plannedRuntimeSeconds: Math.round((c?.plannedRuntimeSeconds ?? 0) * 100) / 100,
    };
  });
}

export async function getFilm(userId: string, filmId: string): Promise<FilmDetail | null> {
  const [film] = await db
    .select()
    .from(films)
    .where(and(eq(films.id, filmId), eq(films.userId, userId)))
    .limit(1);
  if (!film) return null;

  const [scenes, shots] = await Promise.all([
    db
      .select()
      .from(filmScenes)
      .where(eq(filmScenes.filmId, filmId))
      .orderBy(asc(filmScenes.ordinal)),
    db.select().from(filmShots).where(eq(filmShots.filmId, filmId)).orderBy(asc(filmShots.ordinal)),
  ]);
  return { film, scenes, shots };
}

export async function createFilm(userId: string, input: CreateFilmInput): Promise<Film | null> {
  const [film] = await db
    .insert(films)
    .values({
      userId,
      title: input.title,
      logline: input.logline || null,
      premise: input.premise || null,
      screenplay: input.screenplay || null,
      styleBible: input.styleBible || null,
      aspectRatio: input.aspectRatio,
      maxClipSeconds: input.maxClipSeconds ? clampClipSeconds(input.maxClipSeconds) : undefined,
      targetRuntimeSeconds: input.targetRuntimeSeconds ?? null,
      // A film born with a screenplay is already written — asking the operator
      // to press a button to say so would be asking them to restate what they
      // just pasted in.
      status: input.screenplay?.trim() ? FILM_STATUS.WRITTEN : FILM_STATUS.DRAFT,
    })
    .returning();
  return film ?? null;
}

export async function patchFilm(
  userId: string,
  filmId: string,
  input: PatchFilmInput,
): Promise<Film | null> {
  const values: Partial<Film> = { updatedAt: new Date() };
  if (input.title !== undefined) values.title = input.title;
  if (input.logline !== undefined) values.logline = input.logline || null;
  if (input.premise !== undefined) values.premise = input.premise || null;
  if (input.screenplay !== undefined) values.screenplay = input.screenplay || null;
  if (input.styleBible !== undefined) values.styleBible = input.styleBible || null;
  if (input.aspectRatio !== undefined) values.aspectRatio = input.aspectRatio;
  if (input.maxClipSeconds !== undefined)
    values.maxClipSeconds = clampClipSeconds(input.maxClipSeconds);
  if (input.targetRuntimeSeconds !== undefined)
    values.targetRuntimeSeconds = input.targetRuntimeSeconds ?? null;
  if (input.status !== undefined) values.status = input.status;

  // Pasting a screenplay into a draft advances it, but only forward: a film
  // already broken down must not fall back to "written" because someone fixed a
  // typo in the script.
  if (input.screenplay?.trim() && input.status === undefined) {
    const [current] = await db
      .select({ status: films.status })
      .from(films)
      .where(and(eq(films.id, filmId), eq(films.userId, userId)))
      .limit(1);
    if (current?.status === FILM_STATUS.DRAFT) values.status = FILM_STATUS.WRITTEN;
  }

  const [film] = await db
    .update(films)
    .set(values)
    .where(and(eq(films.id, filmId), eq(films.userId, userId)))
    .returning();
  return film ?? null;
}

export async function deleteFilm(userId: string, filmId: string): Promise<boolean> {
  const deleted = await db
    .delete(films)
    .where(and(eq(films.id, filmId), eq(films.userId, userId)))
    .returning({ id: films.id });
  return deleted.length > 0;
}

/** Shots that already have a take against them — what a re-breakdown would destroy. */
export async function countShotsWithClips(userId: string, filmId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(filmShots)
    .where(
      and(
        eq(filmShots.filmId, filmId),
        eq(filmShots.userId, userId),
        sql`${filmShots.clipUrl} is not null`,
      ),
    );
  return row?.n ?? 0;
}

/**
 * Swap in a whole new breakdown.
 *
 * Delete-then-insert rather than a diff, because there is no stable identity to
 * diff against: re-running a breakdown on an edited screenplay legitimately
 * produces a different number of shots in a different order, and matching them
 * up by position would attach take 7 to a shot that is now a different moment
 * in the film. The route decides whether this is allowed to run at all (see
 * `countShotsWithClips`); by the time it is called, the loss is intended.
 */
export async function replaceBreakdown(
  userId: string,
  filmId: string,
  scenes: BrokenDownScene[],
  maxClipSeconds: number,
): Promise<{ scenes: number; shots: number }> {
  const ceiling = clampClipSeconds(maxClipSeconds);

  return db.transaction(async (tx) => {
    // Shots cascade from scenes, but shots whose sceneId is null would survive
    // that, so clear both explicitly.
    await tx.delete(filmShots).where(eq(filmShots.filmId, filmId));
    await tx.delete(filmScenes).where(eq(filmScenes.filmId, filmId));

    let ordinal = 0;
    let sceneCount = 0;

    for (const [index, scene] of scenes.entries()) {
      const [sceneRow] = await tx
        .insert(filmScenes)
        .values({
          filmId,
          userId,
          ordinal: index + 1,
          heading: scene.heading,
          synopsis: scene.synopsis,
          location: scene.location,
          timeOfDay: scene.timeOfDay,
        })
        .returning({ id: filmScenes.id });
      sceneCount += 1;

      // The ceiling is enforced HERE, on the way into the database — so a shot
      // that cannot be rendered cannot be stored, whatever the model proposed.
      const planned = planShots(scene.beats, ceiling);
      if (planned.length === 0) continue;

      await tx.insert(filmShots).values(
        planned.map((shot) => ({
          filmId,
          sceneId: sceneRow.id,
          userId,
          ordinal: (ordinal += 1),
          description: shot.description,
          dialogue: shot.dialogue,
          continuity: shot.continuity,
          shotSize: shot.shotSize,
          cameraMove: shot.cameraMove,
          durationSeconds: shot.durationSeconds,
          partIndex: shot.part?.index ?? null,
          partTotal: shot.part?.total ?? null,
        })),
      );
    }

    await tx
      .update(films)
      .set({
        status: FILM_STATUS.BROKEN_DOWN,
        maxClipSeconds: ceiling,
        brokenDownAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(films.id, filmId), eq(films.userId, userId)));

    return { scenes: sceneCount, shots: ordinal };
  });
}

export async function patchShot(
  userId: string,
  filmId: string,
  shotId: string,
  input: PatchShotInput,
): Promise<FilmShot | null> {
  const values: Partial<FilmShot> = { updatedAt: new Date() };
  if (input.description !== undefined) values.description = input.description;
  if (input.dialogue !== undefined) values.dialogue = input.dialogue || null;
  if (input.continuity !== undefined) values.continuity = input.continuity || null;
  if (input.shotSize !== undefined) values.shotSize = input.shotSize;
  if (input.cameraMove !== undefined) values.cameraMove = input.cameraMove;
  if (input.durationSeconds !== undefined) values.durationSeconds = input.durationSeconds;
  if (input.promptOverride !== undefined) values.promptOverride = input.promptOverride || null;
  if (input.clipUrl !== undefined) values.clipUrl = input.clipUrl || null;
  if (input.status !== undefined) values.status = input.status;

  // Attaching a clip IS the report that the shot was generated. Making the
  // operator also set the status would mean a shot that has a take and claims
  // not to — and the edit list believes the status.
  if (input.clipUrl?.trim() && input.status === undefined) values.status = SHOT_STATUS.GENERATED;

  const [shot] = await db
    .update(filmShots)
    .set(values)
    .where(
      and(eq(filmShots.id, shotId), eq(filmShots.filmId, filmId), eq(filmShots.userId, userId)),
    )
    .returning();
  if (!shot) return null;

  await syncFilmProgress(userId, filmId);
  return shot;
}

/**
 * Move the film's own status to match its shots.
 *
 * Derived rather than set by hand: "assembled" means every shot has a clip, and
 * that is a fact about the shot list, not a button. A film that drops back
 * below complete — a take rejected on review — drops back to shooting, which is
 * the honest state and the one the list page should show.
 */
async function syncFilmProgress(userId: string, filmId: string): Promise<void> {
  const shots = await db
    .select({ status: filmShots.status, clipUrl: filmShots.clipUrl })
    .from(filmShots)
    .where(eq(filmShots.filmId, filmId));
  if (shots.length === 0) return;

  const ready = shots.filter((s) => isUsableShot(s.status, s.clipUrl)).length;
  const status: FilmStatus =
    ready === shots.length
      ? FILM_STATUS.ASSEMBLED
      : ready > 0
        ? FILM_STATUS.SHOOTING
        : FILM_STATUS.BROKEN_DOWN;

  await db
    .update(films)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(films.id, filmId), eq(films.userId, userId)));
}
