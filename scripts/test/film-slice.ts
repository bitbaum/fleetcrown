/**
 * Inline tests for the film slicer (lib/film/slice.ts).
 *
 * The property under test is not "the arithmetic is right" — it is "every shot
 * this produces can actually be rendered". A video model refuses or silently
 * truncates a generation over its limit, so ONE shot over the ceiling is a
 * failed render the operator discovers after paying for it. The ceiling is
 * therefore the one invariant here that has no acceptable failure rate, and it
 * is enforced by code precisely because a model asked to respect it will not.
 *
 * The second property is subtler and is why the slicer is not a while-loop:
 * splitting greedily gives you 8 / 8 / 8 / 1 for a 25-second beat, and that
 * one-second clip is not a shot, it is a flicker. Even splits are the whole
 * reason this file exists.
 *
 * Run: npx tsx scripts/test/film-slice.ts
 */
import {
  CLIP,
  WORDS_PER_SECOND,
  DIALOGUE_PAD_SECONDS,
  SHOT_SIZE,
  CAMERA_MOVE,
} from "@/config/film";
import {
  countWords,
  planShots,
  plannedRuntime,
  requiredSeconds,
  sliceBeat,
  speakingSeconds,
  splitDialogue,
  splitEven,
  type Beat,
} from "@/lib/film/slice";
import { chunkScreenplay } from "@/lib/film/breakdown";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

let passed = 0;
const check = (label: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
};

const beat = (over: Partial<Beat> = {}): Beat => ({
  description: "Maya crosses the kitchen and picks up the letter.",
  dialogue: null,
  shotSize: SHOT_SIZE.MEDIUM,
  cameraMove: CAMERA_MOVE.STATIC,
  durationSeconds: 6,
  ...over,
});

// ── the ceiling ──────────────────────────────────────────────────────────────
check("a beat that already fits is left alone", () => {
  const parts = splitEven(6, 8);
  assert(parts.length === 1 && parts[0] === 6, `got ${JSON.stringify(parts)}`);
});

check("NO part is ever over the ceiling — swept across every duration", () => {
  // The invariant with no acceptable failure rate. Swept rather than sampled,
  // because the failures live at the rounding boundaries, not in the middle.
  for (const max of [2, 4, 5, 8, 10, 12.5]) {
    for (let total = 0.5; total <= 240; total += 0.25) {
      for (const part of splitEven(total, max)) {
        assert(part <= max + 1e-9, `${total}s at max ${max} produced a ${part}s part`);
      }
    }
  }
});

check("no part is ever a useless sliver", () => {
  for (let total = CLIP.MIN_SECONDS; total <= 200; total += 0.25) {
    for (const part of splitEven(total, 8)) {
      assert(part >= CLIP.MIN_SECONDS, `${total}s produced a ${part}s part`);
    }
  }
});

check("the parts add back up to the beat", () => {
  for (let total = 3; total <= 120; total += 0.5) {
    const sum = splitEven(total, 8).reduce((a, b) => a + b, 0);
    assert(Math.abs(sum - total) < 0.05, `${total}s summed to ${sum}`);
  }
});

check("splits are EVEN, not greedy — 25s at 8s is four ~6.25s shots, not 8/8/8/1", () => {
  const parts = splitEven(25, 8);
  assert(parts.length === 4, `expected 4 parts, got ${parts.length}`);
  const spread = Math.max(...parts) - Math.min(...parts);
  assert(spread < 0.1, `parts were uneven: ${JSON.stringify(parts)}`);
});

check("the fewest parts that fit — never more", () => {
  assert(splitEven(16, 8).length === 2, "16/8 should be 2");
  assert(splitEven(16.01, 8).length === 3, "16.01/8 needs a third");
  assert(splitEven(8, 8).length === 1, "exactly the ceiling is one shot");
});

// ── speech sets the floor ────────────────────────────────────────────────────
check("words are counted the way a reader would", () => {
  assert(countWords("  I don't know.  Do you? ") === 5, "punctuation is not a word");
  assert(countWords("") === 0, "empty is zero");
});

check("a silent beat is never padded", () => {
  assert(speakingSeconds(null) === 0, "null");
  assert(speakingSeconds("   ") === 0, "whitespace");
});

check("dialogue is timed at a deliverable rate, with breath either side", () => {
  const line = Array.from({ length: 10 }, () => "word").join(" ");
  const expected = 10 / WORDS_PER_SECOND + DIALOGUE_PAD_SECONDS;
  assert(Math.abs(speakingSeconds(line) - expected) < 0.01, `got ${speakingSeconds(line)}`);
});

check("a beat is never shorter than its own line takes to say", () => {
  // The model guessed 3 seconds for a line that takes about twelve. Honouring
  // the guess would cut the actor off mid-sentence.
  const long = Array.from({ length: 30 }, () => "word").join(" ");
  const required = requiredSeconds(beat({ durationSeconds: 3, dialogue: long }));
  assert(required >= speakingSeconds(long) - 1e-9, `got ${required}`);
  assert(required > 3, "the model's short guess should have been overridden");
});

check("a beat is never shorter than a clip worth generating", () => {
  assert(requiredSeconds(beat({ durationSeconds: 0 })) === CLIP.MIN_SECONDS, "zero");
  assert(requiredSeconds(beat({ durationSeconds: 0.4 })) === CLIP.MIN_SECONDS, "sliver");
});

// ── dialogue travels with the split ──────────────────────────────────────────
check("a line long enough to force a split is split with it", () => {
  const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
  const shots = sliceBeat(beat({ dialogue: long, durationSeconds: 4 }), 8);
  assert(shots.length > 1, "should have split");
  const spoken = shots.map((s) => s.dialogue ?? "").join(" ");
  // Every word exactly once: repeating the whole speech in each clip is the
  // failure this guards, and it delivers the line twice on screen.
  for (let i = 0; i < 40; i++) {
    const matches = spoken.split(/\s+/).filter((w) => w === `word${i}`).length;
    assert(matches === 1, `word${i} appeared ${matches} times`);
  }
});

check("dialogue splits at sentence boundaries when it can", () => {
  const parts = splitDialogue("One two three. Four five six. Seven eight nine.", 3);
  assert(parts.length === 3, `got ${parts.length}`);
  for (const p of parts) assert(/[.!?]$/.test(p.trim()), `part did not end a sentence: "${p}"`);
});

check("one unbroken sentence still splits, at words", () => {
  const parts = splitDialogue("one two three four five six seven eight", 2);
  assert(parts.length === 2 && parts.every((p) => p.length > 0), JSON.stringify(parts));
});

check("fewer sentences than parts leaves later shots silent, not duplicated", () => {
  const parts = splitDialogue("Just the one line.", 3);
  assert(parts[0] === "Just the one line.", `got "${parts[0]}"`);
  assert(parts[1] === "" && parts[2] === "", "the other shots must be silent");
});

// ── shots ────────────────────────────────────────────────────────────────────
check("a split beat is marked as one continuous action", () => {
  const shots = sliceBeat(beat({ durationSeconds: 20 }), 8);
  assert(shots.length === 3, `got ${shots.length}`);
  assert(shots[0].part?.total === 3 && shots[0].part.index === 1, "first part mislabelled");
  assert(shots[2].part?.index === 3, "last part mislabelled");
});

check("every shot after the first is told to open on the previous frame", () => {
  const shots = sliceBeat(beat({ durationSeconds: 20 }), 8);
  assert(shots[0].continuity === null, "the first part carries the model's note, here none");
  for (const shot of shots.slice(1)) {
    assert(/continuation/i.test(shot.continuity ?? ""), `missing continuity: ${shot.continuity}`);
  }
});

check("an unsplit beat keeps the model's own continuity note", () => {
  const shots = sliceBeat(beat({ continuity: "She is still holding the letter." }), 8);
  assert(shots.length === 1, "should not have split");
  assert(shots[0].continuity === "She is still holding the letter.", shots[0].continuity ?? "null");
  assert(shots[0].part === null, "a single shot is not part of anything");
});

check("ordinals are global across the film, in cut order", () => {
  const shots = planShots([beat({ durationSeconds: 20 }), beat({ durationSeconds: 5 })], 8);
  assert(shots.length === 4, `got ${shots.length}`);
  assert(
    shots.map((s) => s.ordinal).join(",") === "1,2,3,4",
    `ordinals were ${shots.map((s) => s.ordinal)}`,
  );
});

check("planned runtime is what the shots actually add up to", () => {
  const shots = planShots([beat({ durationSeconds: 20 }), beat({ durationSeconds: 5 })], 8);
  assert(Math.abs(plannedRuntime(shots) - 25) < 0.05, `got ${plannedRuntime(shots)}`);
});

check("a raised ceiling means fewer, longer shots for the same beat", () => {
  // The whole reason the ceiling is configuration: when a model's limit moves,
  // re-running the breakdown is the only change needed.
  assert(planShots([beat({ durationSeconds: 24 })], 8).length === 3, "at 8s");
  assert(planShots([beat({ durationSeconds: 24 })], 12).length === 2, "at 12s");
  assert(planShots([beat({ durationSeconds: 24 })], 30).length === 1, "at 30s");
});

// ── chunking a long screenplay ───────────────────────────────────────────────
check("a short screenplay is one chunk", () => {
  assert(chunkScreenplay("INT. KITCHEN - NIGHT\n\nShe waits.", 12_000).length === 1, "one");
  assert(chunkScreenplay("   ").length === 0, "nothing to break down");
});

check("a long screenplay is cut at sluglines, never mid-scene", () => {
  const scene = (n: number) =>
    `INT. ROOM ${n} - DAY\n\n${"Action described at some length. ".repeat(40)}`;
  const chunks = chunkScreenplay(
    Array.from({ length: 12 }, (_, i) => scene(i)).join("\n\n"),
    4_000,
  );
  assert(chunks.length > 1, "should have split");
  for (const chunk of chunks) {
    assert(/^INT\./.test(chunk.trim()), `chunk did not start on a slugline: ${chunk.slice(0, 40)}`);
  }
  // Nothing may be dropped on the floor between chunks.
  const rejoined = chunks.join(" ");
  for (let i = 0; i < 12; i++) assert(rejoined.includes(`ROOM ${i} `), `lost scene ${i}`);
});

check("a single scene bigger than the budget is passed through whole", () => {
  // Cutting it anywhere else would hand the model half an action with no
  // slugline, and the two halves would disagree about where they are.
  const huge = `EXT. DESERT - DAY\n\n${"The sun does not move. ".repeat(500)}`;
  const chunks = chunkScreenplay(huge, 1_000);
  assert(chunks.length === 1, `expected 1 oversized chunk, got ${chunks.length}`);
});

console.log(`\n${passed} passed`);
