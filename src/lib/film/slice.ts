/**
 * The slicer — beats in, clip-sized shots out.
 *
 * This is the part of the pipeline that is allowed to be boring, and has to be.
 * A language model reads a screenplay and proposes BEATS: "Maya crosses the
 * kitchen and picks up the letter, about twelve seconds." Twelve seconds is not
 * a clip. This file turns that beat into two six-second shots that a model can
 * actually render, and does it with arithmetic rather than judgement — because
 * the ceiling is a hard constraint and a model asked to respect one will, some
 * meaningful fraction of the time, simply not.
 *
 * Three things it gets right that a naive `while (d > max) emit(max)` does not:
 *
 *   1. EVEN SPLITS, NEVER A RUNT. Greedy splitting of 25s at 8s gives you
 *      8 / 8 / 8 / 1 — and that last one-second clip is not a shot, it is a
 *      flicker. Four 6.25s shots is the same 25 seconds and four usable clips.
 *   2. SPEECH SETS THE FLOOR. A beat whose line takes nine seconds to say
 *      cannot be a six-second shot; the line would be cut off mid-word. The
 *      beat's duration is raised to fit its dialogue BEFORE it is sliced.
 *   3. DIALOGUE TRAVELS WITH THE SPLIT. When a beat with a line is cut in two,
 *      the line is cut too — at a sentence boundary, proportional to the halves.
 *      Otherwise both clips are generated with the whole speech in the prompt
 *      and you get the line delivered twice.
 *
 * Everything here is pure: no db, no model, no clock. That is what makes the
 * ceiling testable, which is the only reason to trust it.
 */

import {
  CLIP,
  DIALOGUE_PAD_SECONDS,
  WORDS_PER_SECOND,
  clampClipSeconds,
  type CameraMove,
  type ShotSize,
} from "@/config/film";

/** What the model proposes: a unit of action, with a guess at how long it runs. */
export type Beat = {
  description: string;
  dialogue?: string | null;
  shotSize: ShotSize;
  cameraMove: CameraMove;
  /** The model's estimate. Advisory — speech and the ceiling both override it. */
  durationSeconds: number;
  /** Anything that must stay true from the previous beat. Model-supplied. */
  continuity?: string | null;
};

/** What comes out: something a single generation can actually produce. */
export type PlannedShot = {
  /** 1-based, global across the whole film. Drives assembly order and file names. */
  ordinal: number;
  description: string;
  dialogue: string | null;
  shotSize: ShotSize;
  cameraMove: CameraMove;
  durationSeconds: number;
  continuity: string | null;
  /** Set when this shot is one piece of a beat too long to render in one go. */
  part: { index: number; total: number } | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const ceil2 = (n: number) => Math.ceil(n * 100) / 100;

/** Words, counted the way a reader would. Punctuation is not a word. */
export function countWords(text: string): number {
  const matched = text.trim().match(/[^\s]+/g);
  return matched ? matched.length : 0;
}

/**
 * How long a line takes to deliver, plus the breath either side of it.
 *
 * Zero for no dialogue — so callers can add it unconditionally and a silent
 * beat is never padded into being longer than the model asked for.
 */
export function speakingSeconds(dialogue: string | null | undefined): number {
  const words = countWords(dialogue ?? "");
  if (words === 0) return 0;
  return round2(words / WORDS_PER_SECOND + DIALOGUE_PAD_SECONDS);
}

/**
 * Split `total` into the fewest equal parts that each fit under `max`.
 *
 * Equal, not greedy: see rule 1 above. The first parts round UP to the
 * hundredth so the remainder lands on the LAST part — rounding the other way
 * would let accumulated shortfall push the final part over the ceiling, which
 * is the one outcome this function exists to prevent.
 */
export function splitEven(total: number, max: number): number[] {
  const ceiling = clampClipSeconds(max);
  const duration = round2(Math.max(0, total));
  if (duration <= ceiling) return [Math.max(duration, 0)];

  const parts = Math.ceil(duration / ceiling);
  const each = duration / parts;
  const head = Array.from({ length: parts - 1 }, () => ceil2(each));
  const tail = round2(duration - head.reduce((sum, n) => sum + n, 0));

  // Rounding can leave the tail a hair under the usable floor. Lifting it costs
  // a few hundredths of a second of total runtime and buys a clip that is worth
  // generating; the alternative is a 1.9s shot nobody wanted.
  head.push(tail < CLIP.MIN_SECONDS ? CLIP.MIN_SECONDS : tail);
  return head;
}

/**
 * Cut a speech into `parts` chunks, at sentence boundaries where it can and at
 * word boundaries where it cannot.
 *
 * Sentence-first because a clip that ends mid-sentence is a clip that has to be
 * regenerated. When there are fewer sentences than parts — one long unbroken
 * line, which is common in voiceover — it falls back to words, and the seam is
 * at least in a sane place rather than inside "something".
 */
export function splitDialogue(dialogue: string, parts: number): string[] {
  const text = dialogue.trim();
  if (parts <= 1 || !text) return [text];

  const sentences = text.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const units = sentences.length >= parts ? sentences : (text.match(/[^\s]+/g) ?? [text]);
  if (units.length <= parts) {
    // One unit per part, padding with empties: a part with no line is a shot of
    // pure action, which is a legitimate thing for it to be.
    return Array.from({ length: parts }, (_, i) => units[i] ?? "");
  }

  // Distribute by word count, not unit count — two short sentences and one long
  // one should not split 1|2 when 2|1 is closer to even.
  const weights = units.map(countWords);
  const totalWords = weights.reduce((sum, n) => sum + n, 0);
  const chunks: string[][] = Array.from({ length: parts }, () => []);
  let bucket = 0;
  let bucketWords = 0;
  for (let i = 0; i < units.length; i++) {
    const remainingBuckets = parts - bucket;
    const remainingUnits = units.length - i;
    const target = totalWords / parts;
    // Move on once this bucket is full — unless doing so would leave a later
    // bucket with nothing to put in it.
    if (bucket < parts - 1 && bucketWords >= target && remainingUnits > remainingBuckets - 1) {
      bucket += 1;
      bucketWords = 0;
    }
    chunks[bucket].push(units[i]);
    bucketWords += weights[i];
  }
  return chunks.map((c) => c.join(" ").trim());
}

/**
 * The duration a beat really needs: the model's estimate, but never shorter
 * than its dialogue and never shorter than a clip worth generating.
 */
export function requiredSeconds(beat: Beat): number {
  const proposed = Number.isFinite(beat.durationSeconds) ? beat.durationSeconds : 0;
  return round2(Math.max(proposed, speakingSeconds(beat.dialogue), CLIP.MIN_SECONDS));
}

/**
 * One beat → one or more shots, none of them over the ceiling.
 *
 * Continuity on a split is written here rather than asked of the model, because
 * it is the same sentence every time and it is the sentence that makes the cut
 * invisible: these pieces are one continuous action, so the next clip has to
 * open exactly where the last one closed.
 */
export function sliceBeat(beat: Beat, maxSeconds: number): Omit<PlannedShot, "ordinal">[] {
  const durations = splitEven(requiredSeconds(beat), maxSeconds);
  const total = durations.length;
  const lines = beat.dialogue ? splitDialogue(beat.dialogue, total) : [];

  return durations.map((durationSeconds, index) => ({
    description: beat.description.trim(),
    dialogue: lines[index]?.trim() || null,
    shotSize: beat.shotSize,
    cameraMove: beat.cameraMove,
    durationSeconds,
    continuity:
      index === 0
        ? (beat.continuity?.trim() ?? null) || null
        : `Unbroken continuation of the previous shot — open on exactly the framing, lighting and character positions the previous clip ended on. Part ${index + 1} of ${total} of one continuous action.`,
    part: total > 1 ? { index: index + 1, total } : null,
  }));
}

/**
 * Every beat in the film, in order, sliced and numbered.
 *
 * Ordinals are global rather than per-scene so that assembly, file naming and
 * "shot 14 is wrong" all refer to the same thing. Renumbering happens here and
 * nowhere else.
 */
export function planShots(beats: Beat[], maxSeconds: number): PlannedShot[] {
  const shots: PlannedShot[] = [];
  for (const beat of beats) {
    for (const sliced of sliceBeat(beat, maxSeconds)) {
      shots.push({ ...sliced, ordinal: shots.length + 1 });
    }
  }
  return shots;
}

/** Planned runtime — what the film will be if every shot gets a clip. */
export function plannedRuntime(shots: { durationSeconds: number }[]): number {
  return round2(shots.reduce((sum, s) => sum + s.durationSeconds, 0));
}
