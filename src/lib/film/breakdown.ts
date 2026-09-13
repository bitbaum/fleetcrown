/**
 * The two model-driven steps: write the screenplay, then break it down.
 *
 * Everything a model is asked to do here is a JUDGEMENT — what happens in the
 * scene, where to cut, how long a beat feels. Everything mechanical happens
 * afterwards in lib/film/slice.ts, which takes the model's beats and enforces
 * the clip ceiling with arithmetic. The division is the point: ask a model to
 * "keep every shot under 8 seconds" and it will hand you a 9-second shot often
 * enough to matter, and a 9-second shot is not a slightly-wrong shot — it is a
 * render that fails or truncates a line mid-word.
 *
 * So the prompt below never mentions a hard limit as a rule to obey. It asks
 * for beats at a natural length and says they will be cut to fit. A model told
 * to respect a ceiling spends its attention on the ceiling; a model told to
 * describe the action spends it on the action, which is the part only it can do.
 *
 * Long screenplays are broken down in chunks split at scene headings, because
 * one 120-page screenplay does not fit in a context window and splitting
 * anywhere else cuts a scene in half.
 */

import { callGroqText } from "@/lib/groq";
import { parseJsonObject } from "@/lib/llm-json";
import { HTTP_TIMEOUT_LONG_MS } from "@/lib/constants/time";
import {
  CAMERA_MOVE,
  CAMERA_MOVES,
  SHOT_SIZE,
  SHOT_SIZES,
  isCameraMove,
  isShotSize,
  type CameraMove,
  type ShotSize,
} from "@/config/film";
import type { Beat } from "@/lib/film/slice";

/**
 * How much screenplay goes to the model at once. Well under the context window
 * on purpose — the reply is several times longer than the input (every page
 * becomes a dozen beats), and it is the REPLY that runs out of room.
 */
const CHUNK_CHARS = 12_000;

/** A reply large enough for a full chunk's beats without truncating mid-object. */
const BREAKDOWN_MAX_TOKENS = 6_000;

export type BrokenDownScene = {
  heading: string | null;
  synopsis: string | null;
  location: string | null;
  timeOfDay: string | null;
  beats: Beat[];
};

export type BreakdownResult = {
  scenes: BrokenDownScene[];
  /** Chunks the model returned nothing usable for. Empty on a clean run. */
  failedChunks: number;
};

// ─── Writing ──────────────────────────────────────────────────────────────────

const SCREENPLAY_SYSTEM = `You are a screenwriter. You write short films that are SHOT, not read — every line must be something a camera can see or a microphone can hear.

Return the screenplay as plain text in standard format:

INT. LOCATION - TIME OF DAY

Action described in present tense, in short paragraphs. One visual idea per paragraph.

CHARACTER NAME
Dialogue, spoken aloud.

Rules:
- Open every scene with a slugline: INT. or EXT., the location, then the time of day.
- Describe only what is visible and audible. No interiority, no backstory a camera cannot show.
- Keep scenes short. A new location or a jump in time is a new scene.
- No camera directions, no shot sizes, no "we see". Those are decided later.
- Write the screenplay and nothing else. No preamble, no notes, no title page.`;

/**
 * Premise → screenplay.
 *
 * The runtime target is expressed in PAGES as well as seconds because that is
 * the unit screenwriting models were trained on; "about 90 seconds" alone
 * reliably produces three pages, while "roughly one page" does not.
 */
export async function draftScreenplay(input: {
  title: string;
  premise: string;
  styleBible?: string | null;
  targetRuntimeSeconds?: number | null;
}): Promise<string> {
  const seconds = input.targetRuntimeSeconds ?? 90;
  // The old rule of thumb: one page of screenplay is one minute of screen time.
  const pages = Math.max(0.5, Math.round((seconds / 60) * 2) / 2);
  const style = input.styleBible?.trim()
    ? `\n\nTone and look to write toward: ${input.styleBible.trim()}`
    : "";

  const prompt = `Title: ${input.title}

Premise:
${input.premise.trim()}

Write this as a short film of roughly ${pages} page${pages === 1 ? "" : "s"} — about ${seconds} seconds of screen time.${style}`;

  const text = await callGroqText(prompt, {
    systemPrompt: SCREENPLAY_SYSTEM,
    maxTokens: 4_000,
    temperature: 0.8,
    timeoutMs: HTTP_TIMEOUT_LONG_MS,
  });
  return text.trim();
}

// ─── Breaking down ────────────────────────────────────────────────────────────

const BREAKDOWN_SYSTEM = `You are a first assistant director breaking a screenplay into shots for a generative video model.

Split the screenplay into scenes, and each scene into BEATS. A beat is one continuous action seen from one camera setup — the moment the camera would need to move or cut is where one beat ends and the next begins.

Return STRICT JSON and nothing else:

{"scenes":[{"heading":"INT. KITCHEN - NIGHT","synopsis":"one sentence","location":"Kitchen","timeOfDay":"Night","beats":[{"description":"what the camera sees, present tense, one or two sentences","dialogue":"the words spoken aloud in this beat, or null","shotSize":"wide","cameraMove":"static","durationSeconds":6,"continuity":"what must match the previous beat, or null"}]}]}

shotSize must be one of: ${SHOT_SIZES.join(", ")}
cameraMove must be one of: ${CAMERA_MOVES.join(", ")}

How to do this well:
- Describe the beat so someone who has not read the screenplay could shoot it. Name who is in frame, what they do, and what the space looks like. The video model sees this beat and nothing else.
- Put a beat's spoken words in "dialogue" exactly as written, and NEVER repeat them in "description".
- durationSeconds is how long the action naturally takes — a glance is 2, crossing a room is 6, a speech is as long as the speech. Do not round everything to the same number, and do not worry about any maximum: long beats are cut into multiple clips automatically afterwards.
- "continuity" is for what would otherwise break between clips: a character holding something, a door left open, the light having changed. Null when nothing carries over.
- Cover the whole screenplay. Every line of dialogue must appear in exactly one beat.`;

type RawBeat = {
  description?: unknown;
  dialogue?: unknown;
  shotSize?: unknown;
  cameraMove?: unknown;
  durationSeconds?: unknown;
  continuity?: unknown;
};

type RawScene = {
  heading?: unknown;
  synopsis?: unknown;
  location?: unknown;
  timeOfDay?: unknown;
  beats?: unknown;
};

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.toLowerCase() !== "null" ? t.slice(0, max) : null;
};

/**
 * Coerce a model's beat into one the slicer can use.
 *
 * Unknown enum values become defaults rather than errors. A model that writes
 * "close_up" where the list says "close" has understood the shot perfectly and
 * mistyped the token; throwing the beat away over that loses the work and the
 * dialogue in it. A wrong-but-plausible shot size is a thing the operator can
 * fix in one click; a missing beat is one they have to notice first.
 */
function coerceBeat(raw: RawBeat): Beat | null {
  const description = str(raw.description, 2000);
  if (!description) return null;

  const size = typeof raw.shotSize === "string" ? raw.shotSize.trim().toLowerCase() : "";
  const move = typeof raw.cameraMove === "string" ? raw.cameraMove.trim().toLowerCase() : "";
  const duration = Number(raw.durationSeconds);

  return {
    description,
    dialogue: str(raw.dialogue, 2000),
    shotSize: (isShotSize(size) ? size : SHOT_SIZE.MEDIUM) as ShotSize,
    cameraMove: (isCameraMove(move) ? move : CAMERA_MOVE.STATIC) as CameraMove,
    // 0 is fine here — the slicer raises it to the floor, and to the length of
    // the dialogue when there is any. Guessing a number would only override
    // speech timing with a worse estimate.
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : 0,
    continuity: str(raw.continuity, 1200),
  };
}

function coerceScenes(payload: { scenes?: unknown } | null): BrokenDownScene[] {
  if (!payload || !Array.isArray(payload.scenes)) return [];
  const scenes: BrokenDownScene[] = [];
  for (const rawScene of payload.scenes as RawScene[]) {
    if (!rawScene || typeof rawScene !== "object") continue;
    const beats = Array.isArray(rawScene.beats)
      ? (rawScene.beats as RawBeat[]).map(coerceBeat).filter((b): b is Beat => b !== null)
      : [];
    // A scene with no usable beat is a scene that cannot be shot. Dropping it
    // is better than carrying an empty header the operator has to delete.
    if (beats.length === 0) continue;
    scenes.push({
      heading: str(rawScene.heading, 200),
      synopsis: str(rawScene.synopsis, 600),
      location: str(rawScene.location, 160),
      timeOfDay: str(rawScene.timeOfDay, 60),
      beats,
    });
  }
  return scenes;
}

/**
 * Cut a screenplay into model-sized pieces at scene headings.
 *
 * Sluglines are the only safe seam: split mid-scene and the model breaks down
 * half an action with no idea where it is, and the two halves disagree about
 * the location. A single scene longer than the budget is passed through whole
 * rather than cut — an over-long chunk that might truncate beats the far side
 * of the boundary, where the failure is silent.
 */
export function chunkScreenplay(screenplay: string, budget = CHUNK_CHARS): string[] {
  const text = screenplay.trim();
  if (text.length <= budget) return text ? [text] : [];

  // Keep the slugline with the scene it heads — split BEFORE each INT./EXT.
  const pieces = text
    .split(/\n(?=\s*(?:INT|EXT|INT\.\/EXT|I\/E)[\s.])/i)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + piece.length + 2 > budget) {
      chunks.push(current);
      current = piece;
    } else {
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Screenplay → scenes and beats.
 *
 * Chunks are processed in sequence rather than in parallel: the provider is
 * rate-limited per minute, and a five-chunk fan-out is the shape most likely to
 * hit it — turning a slow success into a partial failure. A chunk the model
 * fails on is counted, not thrown: nine good scenes and one gap is a film you
 * can work on, and the caller is told which it got.
 */
export async function breakdownScreenplay(input: {
  screenplay: string;
  title: string;
  styleBible?: string | null;
}): Promise<BreakdownResult> {
  const chunks = chunkScreenplay(input.screenplay);
  const scenes: BrokenDownScene[] = [];
  let failedChunks = 0;

  for (const [index, chunk] of chunks.entries()) {
    const context =
      chunks.length > 1
        ? `\n\n(This is part ${index + 1} of ${chunks.length} of the screenplay. Break down only what is below.)`
        : "";
    const style = input.styleBible?.trim()
      ? `\n\nThe film's look, for context — do NOT repeat it in every beat: ${input.styleBible.trim()}`
      : "";
    const prompt = `Film: ${input.title}${style}${context}\n\nScreenplay:\n${chunk}`;

    let raw: string;
    try {
      raw = await callGroqText(prompt, {
        systemPrompt: BREAKDOWN_SYSTEM,
        maxTokens: BREAKDOWN_MAX_TOKENS,
        temperature: 0.3,
        timeoutMs: HTTP_TIMEOUT_LONG_MS,
      });
    } catch {
      failedChunks += 1;
      continue;
    }

    const parsed = coerceScenes(parseJsonObject<{ scenes?: unknown }>(raw));
    if (parsed.length === 0) failedChunks += 1;
    else scenes.push(...parsed);
  }

  return { scenes, failedChunks };
}
