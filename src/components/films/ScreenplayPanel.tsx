"use client";

import { useState } from "react";
import { PenLine, Scissors } from "lucide-react";
import { formatRuntime } from "@/config/film";
import { patchJson, postJson } from "@/lib/api/fetch";
import type { Film } from "@/db/schema";

/**
 * The screenplay, and the two buttons that move it along.
 *
 * "Write it" is only offered when the field is EMPTY. Regenerating over a
 * screenplay the operator has edited is the most destructive thing this page
 * could do, and "you can just regenerate" is not true of the half hour they
 * spent fixing the third scene — so clearing it is a deliberate act, not a
 * side effect of pressing the obvious button.
 */
export function ScreenplayPanel({
  film,
  shotCount,
  onFilmChanged,
  onBrokenDown,
}: {
  film: Film;
  shotCount: number;
  onFilmChanged: (film: Film) => void;
  onBrokenDown: () => void;
}) {
  const [screenplay, setScreenplay] = useState(film.screenplay ?? "");
  const [busy, setBusy] = useState<"writing" | "breaking" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const dirty = screenplay !== (film.screenplay ?? "");

  const saveScreenplay = async () => {
    setBusy("saving");
    setError(null);
    try {
      const res = await patchJson(`/api/films/${film.id}`, { screenplay: screenplay || null });
      const data = await res.json();
      if (!data.ok) setError(data.error ?? "Could not save.");
      else if (data.film) onFilmChanged(data.film as Film);
    } finally {
      setBusy(null);
    }
  };

  const write = async () => {
    setBusy("writing");
    setError(null);
    setNote(null);
    try {
      const res = await postJson(`/api/films/${film.id}/screenplay`, {});
      const data = await res.json();
      if (!data.ok) setError(data.error ?? "Could not write the screenplay.");
      else {
        setScreenplay(data.screenplay as string);
        if (data.film) onFilmChanged(data.film as Film);
      }
    } finally {
      setBusy(null);
    }
  };

  const breakDown = async (replaceGenerated = false) => {
    setBusy("breaking");
    setError(null);
    setNote(null);
    try {
      const res = await postJson(`/api/films/${film.id}/breakdown`, { replaceGenerated });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not break it down.");
        return;
      }
      setNote(
        `${data.shots} shot${data.shots === 1 ? "" : "s"} across ${data.scenes} scene${data.scenes === 1 ? "" : "s"}, none longer than ${data.maxClipSeconds}s.` +
          (data.failedChunks > 0
            ? ` ${data.failedChunks} stretch of the screenplay came back empty — check for gaps.`
            : ""),
      );
      onBrokenDown();
    } finally {
      setBusy(null);
    }
  };

  // A breakdown that would destroy takes is refused by the API with a 409. The
  // operator gets told what it costs and then decides — the same answer is not
  // guessed on their behalf here.
  const clipsAtRisk = error?.includes("Re-running the breakdown discards");

  return (
    <div className="ui-panel space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="ui-kicker">Screenplay</span>
        <span className="text-sm text-text-tertiary">
          {film.targetRuntimeSeconds
            ? `target ${formatRuntime(film.targetRuntimeSeconds)}`
            : "no target runtime"}{" "}
          · clips capped at {film.maxClipSeconds}s
        </span>

        <span className="ml-auto flex flex-wrap items-center gap-2">
          {!screenplay.trim() && film.premise?.trim() && (
            <button
              type="button"
              onClick={write}
              disabled={busy !== null}
              className="ui-btn-secondary"
            >
              <PenLine className="h-3.5 w-3.5" aria-hidden />
              {busy === "writing" ? "Writing…" : "Write it from the premise"}
            </button>
          )}
          {dirty && (
            <button
              type="button"
              onClick={saveScreenplay}
              disabled={busy !== null}
              className="ui-btn-save"
            >
              {busy === "saving" ? "Saving…" : "Save"}
            </button>
          )}
          <button
            type="button"
            onClick={() => breakDown(false)}
            disabled={busy !== null || !screenplay.trim() || dirty}
            className="ui-btn-primary"
          >
            <Scissors className="h-3.5 w-3.5" aria-hidden />
            {busy === "breaking"
              ? "Cutting…"
              : shotCount > 0
                ? "Break down again"
                : "Break it down"}
          </button>
        </span>
      </div>

      <textarea
        value={screenplay}
        onChange={(e) => setScreenplay(e.target.value)}
        placeholder={
          film.premise?.trim()
            ? "Write it yourself, paste one in, or let the premise become a first draft."
            : "Paste a screenplay here. Sluglines (INT./EXT.) are where it gets cut into scenes."
        }
        rows={14}
        className="ui-input resize-y font-mono"
        aria-label="Screenplay"
      />

      {dirty && (
        <p className="text-sm text-text-tertiary">
          Unsaved edits — save before breaking down, or the shots come from the old draft.
        </p>
      )}
      {error && <p className="ui-error">{error}</p>}
      {clipsAtRisk && (
        <button
          type="button"
          onClick={() => breakDown(true)}
          disabled={busy !== null}
          className="ui-btn-danger"
        >
          Break down anyway and discard those clips
        </button>
      )}
      {note && <p className="text-sm text-status-positive">{note}</p>}
    </div>
  );
}
