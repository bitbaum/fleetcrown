/**
 * The film queries, against a real database.
 *
 * Pure tests (film-slice, film-assembly) prove the slicer and the cut. They
 * cannot prove the half that only Postgres can answer: that `replaceBreakdown`
 * leaves no orphan shots when it swaps a shot list, that the aggregate on the
 * list page counts the same shots `isUsableShot` would, that rejecting a take
 * moves the film BACKWARDS, and that none of it is reachable by another user.
 *
 * Runs wherever DATABASE_URL exists and steps aside politely where it does not
 * (see SKIP_UNLESS_ENV in scripts/test-unit.ts) — the alternative is a suite
 * excluded on every machine forever because some machines lack a database,
 * which is how six paths in this repo ended up verified by nobody.
 *
 * It creates its own users and deletes everything it made, so it is safe to
 * point at a dev database.
 *
 * Run: DATABASE_URL=... npx tsx scripts/test/film-queries.ts
 */
import { db } from "@/db";
import { films, filmShots, users } from "@/db/schema";
import { inArray, sql } from "drizzle-orm";
import {
  createFilm,
  getFilm,
  listFilms,
  patchFilm,
  patchShot,
  replaceBreakdown,
  countShotsWithClips,
  deleteFilm,
} from "@/db/queries/films";
import { buildEditList, concatManifest } from "@/lib/film/assembly";
import { FILM_STATUS, SHOT_STATUS, SHOT_SIZE, CAMERA_MOVE } from "@/config/film";

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m);
}

const main = async () => {
  const [user] = await db.insert(users).values({}).returning({ id: users.id });
  const userId = user.id;

  const film = await createFilm(userId, {
    title: "The Letter",
    premise: "She finds a letter she was not meant to read.",
    styleBible: "16mm grain, cold daylight",
    aspectRatio: "2.39:1",
  });
  assert(!!film, "createFilm returned nothing");
  assert(film!.status === FILM_STATUS.DRAFT, `status was ${film!.status}`);
  assert(film!.maxClipSeconds === 8, `default ceiling was ${film!.maxClipSeconds}`);
  console.log("  ✓ createFilm");

  const written = await patchFilm(userId, film!.id, {
    screenplay: "INT. KITCHEN - NIGHT\n\nShe waits.",
  });
  assert(written!.status === FILM_STATUS.WRITTEN, `a pasted screenplay left it ${written!.status}`);
  console.log("  ✓ patchFilm advances draft → written");

  const beat = (over = {}) => ({
    description: "Maya crosses the kitchen",
    dialogue: null as string | null,
    shotSize: SHOT_SIZE.MEDIUM,
    cameraMove: CAMERA_MOVE.STATIC,
    durationSeconds: 6,
    continuity: null as string | null,
    ...over,
  });

  const counts = await replaceBreakdown(
    userId,
    film!.id,
    [
      {
        heading: "INT. KITCHEN - NIGHT",
        synopsis: "She finds it",
        location: "Kitchen",
        timeOfDay: "Night",
        beats: [beat({ durationSeconds: 20 }), beat()],
      },
      {
        heading: "EXT. STREET - DAY",
        synopsis: "She walks",
        location: "Street",
        timeOfDay: "Day",
        beats: [beat({ durationSeconds: 5 })],
      },
    ],
    8,
  );
  assert(counts.scenes === 2, `scenes: ${counts.scenes}`);
  // 20s → 3 shots, 6s → 1, 5s → 1
  assert(counts.shots === 5, `shots: ${counts.shots}`);
  console.log(`  ✓ replaceBreakdown wrote ${counts.shots} shots across ${counts.scenes} scenes`);

  const detail = await getFilm(userId, film!.id);
  assert(detail!.film.status === FILM_STATUS.BROKEN_DOWN, detail!.film.status);
  assert(detail!.shots.length === 5, `got ${detail!.shots.length}`);
  assert(
    detail!.shots.every((s) => s.durationSeconds <= 8),
    "a stored shot is over the ceiling",
  );
  assert(
    detail!.shots.map((s) => s.ordinal).join() === "1,2,3,4,5",
    "ordinals not global/contiguous",
  );
  assert(detail!.shots[0].partTotal === 3, `part total was ${detail!.shots[0].partTotal}`);
  assert(
    detail!.shots.every((s) => !!s.sceneId),
    "a shot lost its scene",
  );
  console.log("  ✓ getFilm — ceiling held, ordinals global, scenes linked");

  // Re-breakdown is refused once clips exist; the count must be real.
  await patchShot(userId, film!.id, detail!.shots[0].id, { clipUrl: "https://cdn/shot-001.mp4" });
  assert((await countShotsWithClips(userId, film!.id)) === 1, "countShotsWithClips wrong");
  const afterClip = await getFilm(userId, film!.id);
  assert(
    afterClip!.shots[0].status === SHOT_STATUS.GENERATED,
    `status was ${afterClip!.shots[0].status}`,
  );
  assert(afterClip!.film.status === FILM_STATUS.SHOOTING, `film was ${afterClip!.film.status}`);
  console.log("  ✓ patchShot: a clip implies generated, and moves the film to shooting");

  const rows = await listFilms(userId);
  assert(rows.length === 1, `listFilms got ${rows.length}`);
  assert(rows[0].shotCount === 5, `shotCount ${rows[0].shotCount}`);
  assert(rows[0].readyShotCount === 1, `readyShotCount ${rows[0].readyShotCount}`);
  assert(
    Math.abs(rows[0].plannedRuntimeSeconds - 31) < 0.05,
    `runtime ${rows[0].plannedRuntimeSeconds}`,
  );
  console.log("  ✓ listFilms aggregates in one query");

  // Rejecting the only take must drop the film back, not leave it claiming progress.
  await patchShot(userId, film!.id, detail!.shots[0].id, { status: SHOT_STATUS.REJECTED });
  const rejected = await getFilm(userId, film!.id);
  assert(rejected!.film.status === FILM_STATUS.BROKEN_DOWN, `film was ${rejected!.film.status}`);
  assert(listFilmsReady(await listFilms(userId)) === 0, "a rejected take still counted as ready");
  console.log("  ✓ a rejected take is not progress");

  // Every shot kept → assembled.
  for (const s of rejected!.shots) {
    await patchShot(userId, film!.id, s.id, {
      clipUrl: `https://cdn/shot-${s.ordinal}.mp4`,
      status: SHOT_STATUS.APPROVED,
    });
  }
  const done = await getFilm(userId, film!.id);
  assert(done!.film.status === FILM_STATUS.ASSEMBLED, `film was ${done!.film.status}`);
  const list = buildEditList(done!.shots);
  assert(list.complete, "edit list not complete");
  assert(!concatManifest(list).includes("ROUGH CUT"), "a finished cut was labelled rough");
  console.log("  ✓ every shot kept → assembled, manifest is a real cut");

  // Re-breaking down with the override clears everything, in one transaction.
  const redone = await replaceBreakdown(
    userId,
    film!.id,
    [
      {
        heading: "INT. CAR - DAY",
        synopsis: null,
        location: null,
        timeOfDay: null,
        beats: [beat()],
      },
    ],
    8,
  );
  assert(redone.shots === 1, `after re-breakdown: ${redone.shots}`);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(filmShots);
  assert(n === 1, `orphan shots left behind: ${n}`);
  console.log("  ✓ re-breakdown replaces wholesale, no orphans");

  // Another user must not see or touch it.
  const [other] = await db.insert(users).values({}).returning({ id: users.id });
  assert((await getFilm(other.id, film!.id)) === null, "cross-user read succeeded");
  assert(
    (await patchFilm(other.id, film!.id, { title: "Stolen" })) === null,
    "cross-user write succeeded",
  );
  assert((await deleteFilm(other.id, film!.id)) === false, "cross-user delete succeeded");
  console.log("  ✓ scoped to the owner");

  assert(await deleteFilm(userId, film!.id), "owner delete failed");
  const [{ n: left }] = await db.select({ n: sql<number>`count(*)::int` }).from(filmShots);
  assert(left === 0, `shots survived the film: ${left}`);
  const [{ n: filmsLeft }] = await db.select({ n: sql<number>`count(*)::int` }).from(films);
  assert(filmsLeft === 0, "film survived delete");
  console.log("  ✓ deleting a film cascades to scenes and shots");

  await db.delete(users).where(inArray(users.id, [userId, other.id]));
  console.log(`\n${"all film query checks passed"}`);
  process.exit(0);
};

function listFilmsReady(rows: { readyShotCount: number }[]): number {
  return rows.reduce((a, r) => a + r.readyShotCount, 0);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
