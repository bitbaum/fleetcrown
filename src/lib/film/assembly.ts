/**
 * Assembly — the shot list, back into one film.
 *
 * The last step of the pipeline is also the least glamorous: put the clips end
 * to end in ordinal order. What makes it worth its own module is the honesty
 * about what is NOT ready. A film of forty shots where thirty-eight have clips
 * is not 95% done — it is not done, and the two gaps are the only thing the
 * operator needs to see. So the edit list is built whether or not it is
 * complete, and it names exactly what is missing.
 *
 * This module produces TEXT, never a process. It writes the concat manifest and
 * the ffmpeg command; it does not run them. That is a deliberate boundary: the
 * clips live wherever the operator put them, encoding choices are theirs, and a
 * server that shells out to ffmpeg over user-supplied paths is a server with a
 * command-injection hole in it. The manifest therefore references DERIVED file
 * names (shot-001.mp4 …), never the stored URLs — which has the pleasant side
 * effect of telling the operator exactly what to save each download as.
 */

import {
  ASSEMBLY_FPS,
  formatRuntime,
  isUsableShot,
  shotSlug,
  type ShotStatus,
} from "@/config/film";
import { shotClipName } from "@/lib/film/shot-prompt";

export type AssemblyShot = {
  ordinal: number;
  durationSeconds: number;
  clipUrl: string | null;
  status: ShotStatus;
  description: string;
};

export type EditEntry = {
  ordinal: number;
  slug: string;
  /** Where this shot starts in the finished film, in seconds. */
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  fileName: string;
  clipUrl: string | null;
  /** False when there is no usable clip — the cut has a hole here. */
  ready: boolean;
};

export type EditList = {
  entries: EditEntry[];
  /** Runtime of the finished film if every shot lands. */
  plannedRuntimeSeconds: number;
  /** Runtime of what actually exists right now. */
  readyRuntimeSeconds: number;
  readyCount: number;
  totalCount: number;
  /** The shots still standing between here and a finished film. */
  missing: { ordinal: number; slug: string; description: string; status: ShotStatus }[];
  complete: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Lay the shots out on a timeline.
 *
 * Start times are computed from PLANNED durations, including for shots that
 * have no clip yet. That is intentional: it means the timeline does not shuffle
 * every time a take comes in, so "the problem is at 0:42" stays true tomorrow.
 */
export function buildEditList(shots: AssemblyShot[]): EditList {
  const ordered = [...shots].sort((a, b) => a.ordinal - b.ordinal);
  const entries: EditEntry[] = [];
  const missing: EditList["missing"] = [];
  let cursor = 0;
  let readySeconds = 0;

  for (const shot of ordered) {
    const ready = isUsableShot(shot.status, shot.clipUrl);
    const start = round2(cursor);
    cursor = round2(cursor + shot.durationSeconds);
    entries.push({
      ordinal: shot.ordinal,
      slug: shotSlug(shot.ordinal),
      startSeconds: start,
      endSeconds: cursor,
      durationSeconds: shot.durationSeconds,
      fileName: shotClipName(shot),
      clipUrl: shot.clipUrl,
      ready,
    });
    if (ready) readySeconds = round2(readySeconds + shot.durationSeconds);
    else
      missing.push({
        ordinal: shot.ordinal,
        slug: shotSlug(shot.ordinal),
        description: shot.description,
        status: shot.status,
      });
  }

  return {
    entries,
    plannedRuntimeSeconds: cursor,
    readyRuntimeSeconds: readySeconds,
    readyCount: entries.length - missing.length,
    totalCount: entries.length,
    missing,
    complete: entries.length > 0 && missing.length === 0,
  };
}

/**
 * The ffmpeg concat-demuxer manifest.
 *
 * Only ready shots are listed — concat fails on a missing file, and a manifest
 * that cannot run is worse than a short one that can, because a rough cut of
 * the 38 shots you have is genuinely useful while you wait on the other two.
 * The header comment says so, so nobody mistakes a rough cut for the film.
 */
export function concatManifest(list: EditList): string {
  const usable = list.entries.filter((e) => e.ready);
  const header = list.complete
    ? `# ${list.totalCount} shots · ${formatRuntime(list.plannedRuntimeSeconds)}`
    : `# ROUGH CUT — ${usable.length} of ${list.totalCount} shots · missing ${list.missing.map((m) => m.slug).join(", ")}`;
  const lines = usable.map((e) => `file '${escapeConcatPath(e.fileName)}'`);
  return [header, ...lines].join("\n") + "\n";
}

/**
 * ffmpeg's concat demuxer terminates a path at an unescaped quote, so a single
 * quote in a name is a parse error at best. Derived names cannot contain one
 * today — this is here so that stays true if the naming scheme ever changes.
 */
function escapeConcatPath(name: string): string {
  return name.replace(/'/g, "'\\''");
}

/**
 * The command to run once the clips are downloaded next to the manifest.
 *
 * `-c copy` because the clips come out of one model at one setting, so there is
 * nothing to reconcile and re-encoding would only cost a generation of quality.
 * The fallback line is for the case where they don't match — which happens the
 * moment you regenerate one shot on a different model.
 */
export function assemblyCommands(outputName = "film.mp4"): { label: string; command: string }[] {
  const safe = outputName.replace(/[^A-Za-z0-9._-]/g, "-");
  return [
    {
      label: "Stitch (fast, no re-encode)",
      command: `ffmpeg -f concat -safe 0 -i shots.txt -c copy ${safe}`,
    },
    {
      label: "Stitch (re-encode — use if clips came from different models)",
      command: `ffmpeg -f concat -safe 0 -i shots.txt -r ${ASSEMBLY_FPS} -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac ${safe}`,
    },
  ];
}

/** One line per shot: where it sits, what it is, whether it exists. */
export function editListText(title: string, list: EditList): string {
  const head = `${title} — edit list (${list.readyCount}/${list.totalCount} shots, ${formatRuntime(list.plannedRuntimeSeconds)})`;
  const rows = list.entries.map(
    (e) =>
      `${formatRuntime(e.startSeconds).padStart(7)}  ${e.slug}  ${String(e.durationSeconds).padStart(5)}s  ${e.ready ? "✓" : "—"}  ${e.fileName}`,
  );
  return [head, "", ...rows].join("\n") + "\n";
}
