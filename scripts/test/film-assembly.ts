/**
 * Inline tests for the prompt composer (lib/film/shot-prompt.ts) and the
 * assembly (lib/film/assembly.ts).
 *
 * Two properties, both about a model that has no memory:
 *
 *   The composer must RESTATE everything in every prompt. A video model sees
 *   one shot and nothing else, so a look described only on shot 1 produces a
 *   film where shot 1 looks right and thirty-nine do not.
 *
 *   The assembly must be honest about holes. Thirty-eight clips out of forty is
 *   not a film, and a manifest that silently lists a file nobody has is a
 *   manifest that fails at the ffmpeg prompt with a confusing error rather than
 *   in the UI with a clear one.
 *
 * Run: npx tsx scripts/test/film-assembly.ts
 */
import { CAMERA_MOVE, SHOT_SIZE, SHOT_STATUS, formatRuntime, shotSlug } from "@/config/film";
import { composeShotPrompt, composeShotSheet, shotClipName } from "@/lib/film/shot-prompt";
import {
  assemblyCommands,
  buildEditList,
  concatManifest,
  editListText,
  type AssemblyShot,
} from "@/lib/film/assembly";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

let passed = 0;
const check = (label: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
};

const FILM = {
  title: "The Letter",
  styleBible: "16mm grain, cold daylight, muted palette",
  aspectRatio: "2.39:1",
};

const SCENE = {
  heading: "INT. KITCHEN - NIGHT",
  location: "Kitchen",
  timeOfDay: "Night",
  synopsis: "Maya finds the letter she was not meant to read.",
};

const shot = (over: Partial<Parameters<typeof composeShotPrompt>[0]["shot"]> = {}) => ({
  ordinal: 7,
  description: "Maya lifts the envelope from the table",
  dialogue: null as string | null,
  continuity: null as string | null,
  shotSize: SHOT_SIZE.CLOSE,
  cameraMove: CAMERA_MOVE.DOLLY_IN,
  durationSeconds: 6.25,
  ...over,
});

// ── the composer ─────────────────────────────────────────────────────────────
check("the prompt opens with the framing and the action, not the film stock", () => {
  // Subject first: a prompt that opens with three sentences about grain gets a
  // beautiful shot of the wrong thing.
  const prompt = composeShotPrompt({ film: FILM, scene: SCENE, shot: shot() });
  const first = prompt.split("\n")[0];
  assert(first.startsWith("Close-up, slow dolly in."), `first line was: ${first}`);
  assert(first.includes("Maya lifts the envelope"), "the action is missing from line one");
});

check("every prompt restates the setting and the look — the model has no memory", () => {
  const prompt = composeShotPrompt({ film: FILM, scene: SCENE, shot: shot() });
  assert(prompt.includes("INT. KITCHEN - NIGHT"), "setting missing");
  assert(prompt.includes("16mm grain"), "style bible missing");
  assert(prompt.includes("2.39:1"), "aspect ratio missing");
  assert(prompt.includes("6.25 seconds"), "duration missing");
});

check("the same shot always composes the same prompt", () => {
  // A re-render must be a re-render, not another roll of the dice.
  const a = composeShotPrompt({ film: FILM, scene: SCENE, shot: shot() });
  const b = composeShotPrompt({ film: FILM, scene: SCENE, shot: shot() });
  assert(a === b, "composition is not deterministic");
});

check("dialogue is framed as spoken audio, never as text on screen", () => {
  const prompt = composeShotPrompt({
    film: FILM,
    scene: SCENE,
    shot: shot({ dialogue: "You read it." }),
  });
  assert(prompt.includes('"You read it."'), "the line is missing");
  assert(/spoken aloud/i.test(prompt), "the line is not marked as spoken");
  assert(/no on-screen text/i.test(prompt), "nothing stops it being rendered as a caption");
});

check("a silent shot says so rather than leaving it open", () => {
  const prompt = composeShotPrompt({ film: FILM, scene: SCENE, shot: shot() });
  assert(prompt.includes("No dialogue in this shot."), "silence is not stated");
});

check("a human's override wins over everything the composer would say", () => {
  const prompt = composeShotPrompt({
    film: FILM,
    scene: SCENE,
    shot: shot({ promptOverride: "  Just this.  " }),
  });
  assert(prompt === "Just this.", `got: ${prompt}`);
});

check("a scene with no slugline falls back to location and time", () => {
  const prompt = composeShotPrompt({
    film: FILM,
    scene: { ...SCENE, heading: null },
    shot: shot(),
  });
  assert(prompt.includes("Setting: Kitchen — Night."), "fallback setting missing");
});

check("a scene with nothing known omits the setting line entirely", () => {
  // An empty "Setting:" reads to a model as a place with no properties, which
  // is worse than not mentioning one.
  const prompt = composeShotPrompt({
    film: FILM,
    scene: { heading: null, location: null, timeOfDay: null, synopsis: null },
    shot: shot(),
  });
  assert(!prompt.includes("Setting:"), "an empty setting line was emitted");
});

check("clip names sort in cut order and match the shot slug", () => {
  assert(shotClipName({ ordinal: 7 }) === "shot-007.mp4", shotClipName({ ordinal: 7 }));
  assert(shotSlug(7) === "SHOT 007", shotSlug(7));
  const names = [1, 2, 10, 100].map((o) => shotClipName({ ordinal: o }));
  assert(
    JSON.stringify([...names].sort()) === JSON.stringify(names),
    `zero-padding does not sort: ${names}`,
  );
});

check("the shot sheet names every clip so returned files can be matched back", () => {
  const sheet = composeShotSheet(FILM, [
    { scene: SCENE, shot: shot({ ordinal: 1 }) },
    { scene: SCENE, shot: shot({ ordinal: 2 }) },
  ]);
  assert(sheet.includes("SHOT 001") && sheet.includes("SHOT 002"), "slugs missing");
  assert(sheet.includes("shot-001.mp4"), "file names missing");
});

// ── the assembly ─────────────────────────────────────────────────────────────
const asShot = (over: Partial<AssemblyShot> = {}): AssemblyShot => ({
  ordinal: 1,
  durationSeconds: 6,
  clipUrl: null,
  status: SHOT_STATUS.PLANNED,
  description: "A shot",
  ...over,
});

check("the timeline is cumulative and in ordinal order", () => {
  const list = buildEditList([
    asShot({ ordinal: 2, durationSeconds: 4 }),
    asShot({ ordinal: 1, durationSeconds: 6 }),
    asShot({ ordinal: 3, durationSeconds: 5.5 }),
  ]);
  assert(list.entries.map((e) => e.ordinal).join() === "1,2,3", "not sorted");
  assert(list.entries[0].startSeconds === 0, "first shot must start at zero");
  assert(list.entries[1].startSeconds === 6, `second started at ${list.entries[1].startSeconds}`);
  assert(list.entries[2].startSeconds === 10, `third started at ${list.entries[2].startSeconds}`);
  assert(list.plannedRuntimeSeconds === 15.5, `runtime was ${list.plannedRuntimeSeconds}`);
});

check("start times come from PLANNED durations, so the timeline does not shuffle", () => {
  // "The problem is at 0:42" has to still be true tomorrow, whether or not the
  // shots before it have takes yet.
  const shots = [asShot({ ordinal: 1 }), asShot({ ordinal: 2 })];
  const before = buildEditList(shots).entries[1].startSeconds;
  const after = buildEditList([
    { ...shots[0], clipUrl: "a.mp4", status: SHOT_STATUS.APPROVED },
    shots[1],
  ]).entries[1].startSeconds;
  assert(before === after, `moved from ${before} to ${after}`);
});

check("a shot is only ready when it has a clip AND a status that kept it", () => {
  const cases: [Partial<AssemblyShot>, boolean][] = [
    [{ clipUrl: "a.mp4", status: SHOT_STATUS.APPROVED }, true],
    [{ clipUrl: "a.mp4", status: SHOT_STATUS.GENERATED }, true],
    // A rejected take is a file that exists and must not reach the cut.
    [{ clipUrl: "a.mp4", status: SHOT_STATUS.REJECTED }, false],
    [{ clipUrl: null, status: SHOT_STATUS.APPROVED }, false],
    [{ clipUrl: null, status: SHOT_STATUS.PLANNED }, false],
  ];
  for (const [over, expected] of cases) {
    const list = buildEditList([asShot(over)]);
    assert(list.entries[0].ready === expected, `${JSON.stringify(over)} → ${!expected}`);
  }
});

check("38 of 40 is not a film — complete is false and the gaps are named", () => {
  const list = buildEditList([
    asShot({ ordinal: 1, clipUrl: "a.mp4", status: SHOT_STATUS.APPROVED }),
    asShot({ ordinal: 2, description: "The one that failed" }),
    asShot({ ordinal: 3, clipUrl: "c.mp4", status: SHOT_STATUS.GENERATED }),
  ]);
  assert(!list.complete, "claimed complete with a hole in it");
  assert(list.readyCount === 2 && list.totalCount === 3, `${list.readyCount}/${list.totalCount}`);
  assert(list.missing.length === 1 && list.missing[0].slug === "SHOT 002", "wrong gap named");
  assert(list.readyRuntimeSeconds === 12, `ready runtime was ${list.readyRuntimeSeconds}`);
});

check("an empty film is not a complete one", () => {
  const list = buildEditList([]);
  assert(
    !list.complete && list.totalCount === 0,
    "an empty shot list claimed to be a finished cut",
  );
});

check("the manifest lists only files that exist, and says it is a rough cut", () => {
  const list = buildEditList([
    asShot({ ordinal: 1, clipUrl: "a.mp4", status: SHOT_STATUS.APPROVED }),
    asShot({ ordinal: 2 }),
  ]);
  const manifest = concatManifest(list);
  assert(manifest.includes("file 'shot-001.mp4'"), "ready shot missing");
  assert(!manifest.includes("shot-002.mp4"), "listed a file nobody has — ffmpeg would fail");
  assert(/ROUGH CUT/.test(manifest), "did not warn that this is not the film");
  assert(manifest.includes("SHOT 002"), "did not say what is missing");
});

check("a complete manifest does not cry rough cut", () => {
  const list = buildEditList([asShot({ clipUrl: "a.mp4", status: SHOT_STATUS.APPROVED })]);
  assert(!/ROUGH CUT/.test(concatManifest(list)), "a finished cut was labelled rough");
});

check("the output name is sanitised before it reaches a shell", () => {
  const [fast] = assemblyCommands("my film; rm -rf ~.mp4");
  assert(!/[;&|$`]/.test(fast.command), `unsafe command: ${fast.command}`);
});

check("runtime reads the way a person says it", () => {
  assert(formatRuntime(8.5) === "8.5s", formatRuntime(8.5));
  assert(formatRuntime(64) === "1:04", formatRuntime(64));
  assert(formatRuntime(119.6) === "2:00", formatRuntime(119.6));
  assert(formatRuntime(0) === "0s", formatRuntime(0));
});

check("the edit list reads as a list of shots with their times", () => {
  const list = buildEditList([
    asShot({ ordinal: 1, clipUrl: "a.mp4", status: SHOT_STATUS.APPROVED }),
  ]);
  const text = editListText("The Letter", list);
  assert(text.includes("The Letter"), "title missing");
  assert(text.includes("SHOT 001") && text.includes("shot-001.mp4"), "row missing");
});

console.log(`\n${passed} passed`);
