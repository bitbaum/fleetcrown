/**
 * The prompt composer — one shot, one generation prompt.
 *
 * A video model sees each clip in isolation. It has no memory of the clip
 * before it, so everything that has to stay the same across forty shots — the
 * look, the lens, the time of day, what the kitchen is made of — has to be
 * restated in every single prompt. That restating is what this file does, and
 * it does it from stored fields rather than free text so that the phrasing is
 * IDENTICAL every time. "Medium shot" in shot 3 and "mid shot" in shot 4 is how
 * you tell a model those are two different setups when you meant one.
 *
 * The order is deliberate and follows how these models weight a prompt: what we
 * are looking at, what it does, how the camera sees it, where we are, what
 * carries over, what is said, and only then the house style. Subject first,
 * because a prompt that opens with three sentences of film-stock description
 * gets a beautiful shot of the wrong thing.
 *
 * `promptOverride` on a shot beats all of this. A person who has watched a take
 * fail knows something the composer does not, and their edit must not be
 * silently re-derived away on the next render.
 */

import {
  CAMERA_MOVE_PHRASE,
  SHOT_SIZE_PHRASE,
  DEFAULT_ASPECT_RATIO,
  shotSlug,
  type CameraMove,
  type ShotSize,
} from "@/config/film";

export type PromptFilm = {
  title: string;
  styleBible: string | null;
  aspectRatio: string | null;
};

export type PromptScene = {
  heading: string | null;
  location: string | null;
  timeOfDay: string | null;
  synopsis: string | null;
};

export type PromptShot = {
  ordinal: number;
  description: string;
  dialogue: string | null;
  continuity: string | null;
  shotSize: ShotSize;
  cameraMove: CameraMove;
  durationSeconds: number;
  promptOverride?: string | null;
};

/**
 * "INT. KITCHEN — NIGHT" out of whatever the breakdown managed to capture.
 * Falls back through heading → location+time → nothing, because a prompt with
 * an empty "Setting:" line is worse than a prompt with no setting line: it
 * reads to the model as a place with no properties.
 */
function settingLine(scene: PromptScene): string | null {
  if (scene.heading?.trim()) return scene.heading.trim();
  const parts = [scene.location?.trim(), scene.timeOfDay?.trim()].filter(Boolean);
  return parts.length ? parts.join(" — ") : null;
}

/**
 * Compose the prompt for one shot.
 *
 * Pure and deterministic: the same shot always produces the same string, which
 * is what makes a re-render a re-render rather than a new roll of the dice.
 */
export function composeShotPrompt({
  film,
  scene,
  shot,
}: {
  film: PromptFilm;
  scene: PromptScene;
  shot: PromptShot;
}): string {
  const override = shot.promptOverride?.trim();
  if (override) return override;

  const lines: string[] = [];

  // 1. Framing and movement, then the action. Camera first is how these models
  //    are trained to read a shot description.
  const framing = `${SHOT_SIZE_PHRASE[shot.shotSize]}, ${CAMERA_MOVE_PHRASE[shot.cameraMove]}`;
  lines.push(`${capitalise(framing)}. ${ensurePeriod(shot.description.trim())}`);

  // 2. Where we are — restated every shot, because the model does not remember.
  const setting = settingLine(scene);
  if (setting) lines.push(`Setting: ${setting}.`);
  if (scene.synopsis?.trim()) lines.push(`Scene context: ${ensurePeriod(scene.synopsis.trim())}`);

  // 3. What has to carry over from the clip before this one.
  if (shot.continuity?.trim()) lines.push(`Continuity: ${ensurePeriod(shot.continuity.trim())}`);

  // 4. Speech. Stated as spoken audio rather than as text, so the model does
  //    not render the words as on-screen captions — a common and expensive
  //    failure when the line is passed in bare quotes with no framing.
  if (shot.dialogue?.trim()) {
    lines.push(`Spoken aloud on camera, lip-synced, no on-screen text: "${shot.dialogue.trim()}"`);
  } else {
    lines.push("No dialogue in this shot.");
  }

  // 5. House style last — it applies to everything above and should not
  //    outrank the subject.
  if (film.styleBible?.trim())
    lines.push(`Look and style: ${ensurePeriod(film.styleBible.trim())}`);

  lines.push(
    `Format: ${film.aspectRatio || DEFAULT_ASPECT_RATIO} aspect ratio, ${shot.durationSeconds} seconds, continuous single take, no cuts, no title cards, no watermark.`,
  );

  return lines.join("\n");
}

/** What a clip file for this shot should be called. Sorts in cut order. */
export function shotClipName(shot: { ordinal: number }, extension = "mp4"): string {
  return `${shotSlug(shot.ordinal).toLowerCase().replace(/\s+/g, "-")}.${extension}`;
}

/**
 * The whole film's prompts as one block, ready to paste into a tool that takes
 * a batch. Separated by the shot slug so a returned set of clips can be matched
 * back to shots by name alone.
 */
export function composeShotSheet(
  film: PromptFilm,
  rows: { scene: PromptScene; shot: PromptShot }[],
): string {
  const header = `${film.title} — shot sheet (${rows.length} clips, ${film.aspectRatio || DEFAULT_ASPECT_RATIO})`;
  const blocks = rows.map(({ scene, shot }) => {
    const prompt = composeShotPrompt({ film, scene, shot });
    return `── ${shotSlug(shot.ordinal)} · ${shot.durationSeconds}s · ${shotClipName(shot)}\n${prompt}`;
  });
  return [header, "", ...blocks].join("\n\n");
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function ensurePeriod(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}
