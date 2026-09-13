"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import {
  CAMERA_MOVE_PHRASE,
  SHOT_SIZE_PHRASE,
  SHOT_STATUS,
  SHOT_STATUS_LABEL,
  SHOT_STATUS_TONE,
  shotSlug,
  type ShotStatus,
} from "@/config/film";
import { composeShotPrompt, shotClipName } from "@/lib/film/shot-prompt";
import type { FilmShot } from "@/db/schema";
import { patchJson } from "@/lib/api/fetch";
import { useClipboard } from "@/hooks/use-clipboard";

export type ShotScene = {
  heading: string | null;
  location: string | null;
  timeOfDay: string | null;
  synopsis: string | null;
};

/**
 * One shot: what it is, the prompt that generates it, and where its clip went.
 *
 * The prompt is shown in full rather than behind a disclosure, because the
 * prompt IS the work here — an operator reads it, spots that the model has put
 * the wrong character in frame, and fixes it before spending a render. Hiding
 * it would hide the only thing on this card worth checking.
 */
export function ShotCard({
  filmId,
  shot,
  scene,
  film,
  onChanged,
}: {
  filmId: string;
  shot: FilmShot;
  scene: ShotScene;
  film: { title: string; styleBible: string | null; aspectRatio: string | null };
  onChanged: (shot: FilmShot) => void;
}) {
  const { copied, copy } = useClipboard();
  const [clipUrl, setClipUrl] = useState(shot.clipUrl ?? "");
  const [saving, setSaving] = useState(false);

  const prompt = composeShotPrompt({ film, scene, shot });

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await patchJson(`/api/films/${filmId}/shots/${shot.id}`, patch);
      const data = await res.json();
      if (data.ok && data.shot) onChanged(data.shot as FilmShot);
    } finally {
      setSaving(false);
    }
  };

  const setStatus = (status: ShotStatus) => save({ status });

  return (
    <div className="ui-card-shell space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="ui-micro-label">{shotSlug(shot.ordinal)}</span>
        <span className="text-sm text-text-secondary">{shot.durationSeconds}s</span>
        {shot.partTotal && shot.partTotal > 1 && (
          <span className="ui-badge">
            part {shot.partIndex}/{shot.partTotal}
          </span>
        )}
        <span className="text-sm text-text-tertiary">
          {SHOT_SIZE_PHRASE[shot.shotSize]} · {CAMERA_MOVE_PHRASE[shot.cameraMove]}
        </span>
        <span className={`ml-auto ui-tag-${SHOT_STATUS_TONE[shot.status]}`}>
          {SHOT_STATUS_LABEL[shot.status]}
        </span>
      </div>

      <p className="text-sm text-text-primary">{shot.description}</p>
      {shot.dialogue && (
        <p className="text-sm text-text-secondary italic">&ldquo;{shot.dialogue}&rdquo;</p>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="ui-kicker">Prompt</span>
          {shot.promptOverride && <span className="ui-badge">edited</span>}
          <button
            type="button"
            onClick={() => copy(prompt)}
            className="ui-btn-xs ml-auto"
            aria-label={`Copy the prompt for ${shotSlug(shot.ordinal)}`}
          >
            {copied ? (
              <Check className="h-3 w-3" aria-hidden />
            ) : (
              <Copy className="h-3 w-3" aria-hidden />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="ui-panel max-h-48 overflow-auto whitespace-pre-wrap text-sm text-text-secondary">
          {prompt}
        </pre>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={clipUrl}
          onChange={(e) => setClipUrl(e.target.value)}
          onBlur={() => clipUrl !== (shot.clipUrl ?? "") && save({ clipUrl: clipUrl || null })}
          placeholder={`Clip URL — save the file as ${shotClipName(shot)}`}
          className="ui-input-compact min-w-0 flex-1"
          aria-label={`Clip URL for ${shotSlug(shot.ordinal)}`}
        />
        {/* Approve and reject only appear once there is a take to judge —
            before that they would be asking about a file nobody has. */}
        {shot.clipUrl && (
          <>
            <button
              type="button"
              disabled={saving || shot.status === SHOT_STATUS.APPROVED}
              onClick={() => setStatus(SHOT_STATUS.APPROVED)}
              className="ui-btn-xs"
            >
              <Check className="h-3 w-3" aria-hidden />
              Keep
            </button>
            <button
              type="button"
              disabled={saving || shot.status === SHOT_STATUS.REJECTED}
              onClick={() => setStatus(SHOT_STATUS.REJECTED)}
              className="ui-btn-xs"
            >
              <X className="h-3 w-3" aria-hidden />
              Reject
            </button>
          </>
        )}
      </div>
    </div>
  );
}
