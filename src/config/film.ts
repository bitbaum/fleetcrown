/**
 * Film — SSOT for turning a written screenplay into clips a video model can
 * actually generate, and back into one film.
 *
 * The whole feature exists because of one constraint: text-to-video models cap
 * a single generation at a few seconds. A 90-second short is therefore never
 * "one render" — it is a dozen renders that have to agree with each other about
 * what the room looks like and where everyone is standing.
 *
 * So the pipeline is: write the screenplay → break it into scenes → slice the
 * scenes into shots that FIT the ceiling → compose one prompt per shot →
 * generate → assemble in order. The writing is the part a person cares about;
 * the slicing is the part that has to be mechanical, because it is the part
 * that is easy to get subtly wrong and expensive to discover late.
 *
 * Two rules this file exists to keep:
 *
 *   1. THE CEILING IS NOT THE MODEL'S TO RESPECT. A language model asked for
 *      "shots under eight seconds" will hand back a nine-second shot often
 *      enough to matter, and a shot over the ceiling is not a slightly-wrong
 *      shot — it is a render that fails or silently truncates mid-line. So the
 *      model PROPOSES beats and `lib/film/slice.ts` ENFORCES the ceiling.
 *   2. The ceiling is a moving target. Every model raises it eventually, so it
 *      is configuration (env + a per-film snapshot column), never a literal in
 *      a prompt or a component. When the limit moves you change one env var and
 *      re-break-down; nothing in the codebase needs editing.
 */

import { z } from "zod";
import type { StatusTone } from "@/lib/constants/statuses";

// ─── The clip ceiling ─────────────────────────────────────────────────────────

export const CLIP = {
  /**
   * Below this a generated clip reads as a glitch rather than a shot — it is on
   * screen for less time than it takes a viewer to parse the frame. The slicer
   * would rather hand back one 3s shot than a 2.5s and a 0.5s.
   */
  MIN_SECONDS: 2,
  /**
   * What a single generation commonly caps at today. A default, not a claim
   * about any one vendor — override per install with FILM_MAX_CLIP_SECONDS.
   */
  DEFAULT_MAX_SECONDS: 8,
  /** Typo guard at the boundary, not a statement about what models can do. */
  CEILING_SECONDS: 60,
  /** Longest film this will plan. Past here you want an editor, not a pipeline. */
  MAX_FILM_SECONDS: 60 * 60,
} as const;

/**
 * Speech is the one thing in a shot that has a real duration, so it is the one
 * thing that can make a shot impossible to fit. ~2.5 words/second is unhurried
 * screen delivery — deliberately slower than conversational speech (~3.3),
 * because a line that is rushed to fit the clip is worse than a line split
 * across two clips.
 */
export const WORDS_PER_SECOND = 2.5;

/** Silence around a spoken line, so a clip does not start and end mid-breath. */
export const DIALOGUE_PAD_SECONDS = 0.6;

/**
 * The installation's clip ceiling. Read at breakdown time and STORED on the
 * film, so raising the env var later never silently invalidates the shot list
 * of a film already half-generated.
 */
export function configuredMaxClipSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.FILM_MAX_CLIP_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? clampClipSeconds(raw) : CLIP.DEFAULT_MAX_SECONDS;
}

export function clampClipSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return CLIP.DEFAULT_MAX_SECONDS;
  return Math.min(CLIP.CEILING_SECONDS, Math.max(CLIP.MIN_SECONDS, Math.round(seconds * 10) / 10));
}

// ─── Film lifecycle ───────────────────────────────────────────────────────────

/**
 * A film moves in one direction, and each step is a thing a person did:
 * wrote the premise, wrote (or pasted) the screenplay, ran the breakdown,
 * started generating clips, assembled the cut.
 */
export const FILM_STATUS = {
  DRAFT: "draft",
  WRITTEN: "written",
  BROKEN_DOWN: "broken_down",
  SHOOTING: "shooting",
  ASSEMBLED: "assembled",
} as const;
export type FilmStatus = (typeof FILM_STATUS)[keyof typeof FILM_STATUS];

export const FILM_STATUS_LABEL: Record<FilmStatus, string> = {
  [FILM_STATUS.DRAFT]: "Draft",
  [FILM_STATUS.WRITTEN]: "Written",
  [FILM_STATUS.BROKEN_DOWN]: "Broken down",
  [FILM_STATUS.SHOOTING]: "Shooting",
  [FILM_STATUS.ASSEMBLED]: "Assembled",
};

export const FILM_STATUS_HINT: Record<FilmStatus, string> = {
  [FILM_STATUS.DRAFT]: "An idea. No screenplay yet.",
  [FILM_STATUS.WRITTEN]: "There is a screenplay. Nothing is sliced.",
  [FILM_STATUS.BROKEN_DOWN]: "Scenes and shots exist. Nothing is generated.",
  [FILM_STATUS.SHOOTING]: "Clips are coming in.",
  [FILM_STATUS.ASSEMBLED]: "Every shot has a clip. The cut is ready.",
};

export const FILM_STATUS_TONE: Record<FilmStatus, StatusTone> = {
  [FILM_STATUS.DRAFT]: "neutral",
  [FILM_STATUS.WRITTEN]: "neutral",
  [FILM_STATUS.BROKEN_DOWN]: "warning",
  [FILM_STATUS.SHOOTING]: "warning",
  [FILM_STATUS.ASSEMBLED]: "positive",
};

// ─── Shot lifecycle ───────────────────────────────────────────────────────────

/**
 * `PLANNED` → `GENERATED` → `APPROVED` is the happy path; `REJECTED` is the one
 * that matters, because a rejected shot is the normal case. Video models miss
 * roughly as often as they hit, so a shot list that cannot hold "this take is
 * wrong, the prompt stays" loses the only state the operator actually works in.
 */
export const SHOT_STATUS = {
  PLANNED: "planned",
  GENERATED: "generated",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;
export type ShotStatus = (typeof SHOT_STATUS)[keyof typeof SHOT_STATUS];

export const SHOT_STATUS_LABEL: Record<ShotStatus, string> = {
  [SHOT_STATUS.PLANNED]: "Planned",
  [SHOT_STATUS.GENERATED]: "Take in",
  [SHOT_STATUS.APPROVED]: "Approved",
  [SHOT_STATUS.REJECTED]: "Rejected",
};

export const SHOT_STATUS_TONE: Record<ShotStatus, StatusTone> = {
  [SHOT_STATUS.PLANNED]: "neutral",
  [SHOT_STATUS.GENERATED]: "warning",
  [SHOT_STATUS.APPROVED]: "positive",
  [SHOT_STATUS.REJECTED]: "negative",
};

/** A shot counts toward the cut only once it has a clip the operator kept. */
export function isUsableShot(status: ShotStatus, clipUrl: string | null): boolean {
  return Boolean(clipUrl) && (status === SHOT_STATUS.APPROVED || status === SHOT_STATUS.GENERATED);
}

// ─── Camera vocabulary ────────────────────────────────────────────────────────
//
// Closed lists rather than free text, for one reason: these words go into every
// generated prompt, and a vocabulary of eight terms used consistently across
// forty shots produces a film that looks like one film. "Medium shot" in shot 3
// and "mid-shot" in shot 4 is how a model is told they are different setups.

export const SHOT_SIZE = {
  EXTREME_WIDE: "extreme_wide",
  WIDE: "wide",
  MEDIUM: "medium",
  CLOSE: "close",
  EXTREME_CLOSE: "extreme_close",
  OVER_SHOULDER: "over_shoulder",
  POV: "pov",
  INSERT: "insert",
} as const;
export type ShotSize = (typeof SHOT_SIZE)[keyof typeof SHOT_SIZE];
export const SHOT_SIZES = Object.values(SHOT_SIZE) as [ShotSize, ...ShotSize[]];

/** The exact phrase that goes in the prompt. This is the whole point of the enum. */
export const SHOT_SIZE_PHRASE: Record<ShotSize, string> = {
  [SHOT_SIZE.EXTREME_WIDE]: "extreme wide shot",
  [SHOT_SIZE.WIDE]: "wide shot",
  [SHOT_SIZE.MEDIUM]: "medium shot",
  [SHOT_SIZE.CLOSE]: "close-up",
  [SHOT_SIZE.EXTREME_CLOSE]: "extreme close-up",
  [SHOT_SIZE.OVER_SHOULDER]: "over-the-shoulder shot",
  [SHOT_SIZE.POV]: "point-of-view shot",
  [SHOT_SIZE.INSERT]: "insert shot",
};

export const CAMERA_MOVE = {
  STATIC: "static",
  PAN: "pan",
  TILT: "tilt",
  DOLLY_IN: "dolly_in",
  DOLLY_OUT: "dolly_out",
  TRACKING: "tracking",
  HANDHELD: "handheld",
  CRANE: "crane",
} as const;
export type CameraMove = (typeof CAMERA_MOVE)[keyof typeof CAMERA_MOVE];
export const CAMERA_MOVES = Object.values(CAMERA_MOVE) as [CameraMove, ...CameraMove[]];

export const CAMERA_MOVE_PHRASE: Record<CameraMove, string> = {
  [CAMERA_MOVE.STATIC]: "locked-off static camera",
  [CAMERA_MOVE.PAN]: "slow pan",
  [CAMERA_MOVE.TILT]: "slow tilt",
  [CAMERA_MOVE.DOLLY_IN]: "slow dolly in",
  [CAMERA_MOVE.DOLLY_OUT]: "slow dolly out",
  [CAMERA_MOVE.TRACKING]: "tracking shot following the subject",
  [CAMERA_MOVE.HANDHELD]: "handheld, subtle movement",
  [CAMERA_MOVE.CRANE]: "craning camera move",
};

export function isShotSize(value: string): value is ShotSize {
  return (SHOT_SIZES as readonly string[]).includes(value);
}

export function isCameraMove(value: string): value is CameraMove {
  return (CAMERA_MOVES as readonly string[]).includes(value);
}

// ─── Format ───────────────────────────────────────────────────────────────────

export const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "2.39:1"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export const DEFAULT_ASPECT_RATIO: AspectRatio = "16:9";

/**
 * Frames per second the assembly assumes. Only used to state the cut's format —
 * nothing here re-times a clip, because re-timing a generated clip is the kind
 * of silent quality loss you want an editor to opt into, not a default.
 */
export const ASSEMBLY_FPS = 24;

// ─── Request bodies ───────────────────────────────────────────────────────────

const trimmed = (max: number) => z.string().trim().max(max);

export const MAX_SCREENPLAY_CHARS = 120_000;

export const CreateFilmBody = z.object({
  title: z.string().trim().min(2, "title is required").max(160),
  logline: trimmed(400).optional(),
  premise: trimmed(4000).optional(),
  screenplay: trimmed(MAX_SCREENPLAY_CHARS).optional(),
  styleBible: trimmed(4000).optional(),
  aspectRatio: z.enum(ASPECT_RATIOS).optional(),
  maxClipSeconds: z.number().min(CLIP.MIN_SECONDS).max(CLIP.CEILING_SECONDS).optional(),
  targetRuntimeSeconds: z.number().int().min(1).max(CLIP.MAX_FILM_SECONDS).optional(),
});
export type CreateFilmInput = z.infer<typeof CreateFilmBody>;

export const PatchFilmBody = z
  .object({
    title: z.string().trim().min(2).max(160).optional(),
    logline: trimmed(400).nullable().optional(),
    premise: trimmed(4000).nullable().optional(),
    screenplay: trimmed(MAX_SCREENPLAY_CHARS).nullable().optional(),
    styleBible: trimmed(4000).nullable().optional(),
    aspectRatio: z.enum(ASPECT_RATIOS).optional(),
    maxClipSeconds: z.number().min(CLIP.MIN_SECONDS).max(CLIP.CEILING_SECONDS).optional(),
    targetRuntimeSeconds: z.number().int().min(1).max(CLIP.MAX_FILM_SECONDS).nullable().optional(),
    status: z.enum(Object.values(FILM_STATUS) as [FilmStatus, ...FilmStatus[]]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type PatchFilmInput = z.infer<typeof PatchFilmBody>;

/**
 * Re-running a breakdown throws away the existing shot list, so the clip URLs
 * attached to it would go with it. `keepGenerated` is the guard: on by default,
 * it refuses to replace a shot list that already has takes against it unless
 * the caller says so explicitly.
 */
export const BreakdownFilmBody = z.object({
  maxClipSeconds: z.number().min(CLIP.MIN_SECONDS).max(CLIP.CEILING_SECONDS).optional(),
  replaceGenerated: z.boolean().optional(),
});
export type BreakdownFilmInput = z.infer<typeof BreakdownFilmBody>;

export const PatchShotBody = z
  .object({
    description: trimmed(2000).optional(),
    dialogue: trimmed(2000).nullable().optional(),
    continuity: trimmed(1200).nullable().optional(),
    shotSize: z.enum(SHOT_SIZES).optional(),
    cameraMove: z.enum(CAMERA_MOVES).optional(),
    durationSeconds: z.number().min(CLIP.MIN_SECONDS).max(CLIP.CEILING_SECONDS).optional(),
    promptOverride: trimmed(6000).nullable().optional(),
    clipUrl: trimmed(2000).nullable().optional(),
    status: z.enum(Object.values(SHOT_STATUS) as [ShotStatus, ...ShotStatus[]]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type PatchShotInput = z.infer<typeof PatchShotBody>;

// ─── Display ──────────────────────────────────────────────────────────────────

/** "1:04" / "8.5s" — runtime for humans, at the two scales that come up. */
export function formatRuntime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  if (seconds < 60) return `${Math.round(seconds * 10) / 10}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds - mins * 60);
  return secs === 60 ? `${mins + 1}:00` : `${mins}:${String(secs).padStart(2, "0")}`;
}

/** "SHOT 007" — stable, sortable, and the same string the clip file is named. */
export function shotSlug(ordinal: number): string {
  return `SHOT ${String(ordinal).padStart(3, "0")}`;
}
