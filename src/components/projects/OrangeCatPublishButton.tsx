"use client";

import { useEffect, useState } from "react";
import { Cat } from "lucide-react";

type PublishState =
  | { phase: "loading" }
  | { phase: "unavailable" } // no user_projects row (readonly/foreign project)
  | { phase: "unlinked" }
  | { phase: "unpublished" }
  | { phase: "publishing" }
  | { phase: "published"; orangecatProjectId: string }
  | { phase: "unpublishing"; orangecatProjectId: string };

/**
 * "Publish to OrangeCat" — opt-in per-project projection onto the OrangeCat
 * economic layer (cross-product bridge Part C).
 *
 * Linking an OrangeCat account (OIDC) is NOT this button and is NOT consent to
 * publish. Publish is per-project and starts from the moment of opt-in; past
 * private history is not dumped onto the wall by default.
 */
export function OrangeCatPublishButton({ projectId }: { projectId: string }) {
  const [state, setState] = useState<PublishState>({ phase: "loading" });
  // Taking it down can fail in ways the person can act on (not linked, an
  // OrangeCat too old to be asked), so the reason is shown rather than swallowed.
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/user-projects/${projectId}/publish-orangecat`);
        if (!res.ok) {
          if (!cancelled) setState({ phase: "unavailable" });
          return;
        }
        const json = (await res.json()) as { linked: boolean; orangecatProjectId: string | null };
        if (cancelled) return;
        if (json.orangecatProjectId) {
          setState({ phase: "published", orangecatProjectId: json.orangecatProjectId });
        } else {
          setState({ phase: json.linked ? "unpublished" : "unlinked" });
        }
      } catch {
        if (!cancelled) setState({ phase: "unavailable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function publish() {
    setState({ phase: "publishing" });
    try {
      const res = await fetch(`/api/user-projects/${projectId}/publish-orangecat`, {
        method: "POST",
      });
      const json = (await res.json()) as { orangecatProjectId?: string; reason?: string };
      if (res.ok && json.orangecatProjectId) {
        setState({ phase: "published", orangecatProjectId: json.orangecatProjectId });
      } else if (json.reason === "not_linked") {
        setState({ phase: "unlinked" });
      } else {
        setState({ phase: "unpublished" });
      }
    } catch {
      setState({ phase: "unpublished" });
    }
  }

  async function unpublish() {
    if (state.phase !== "published") return;
    const ocId = state.orangecatProjectId;
    setError(null);
    setState({ phase: "unpublishing", orangecatProjectId: ocId });
    try {
      const res = await fetch(`/api/user-projects/${projectId}/publish-orangecat`, {
        method: "DELETE",
      });
      if (res.ok) {
        setState({ phase: "unpublished" });
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? "Could not take it down — try again shortly.");
      setState({ phase: "published", orangecatProjectId: ocId });
    } catch {
      setError("Could not reach OrangeCat — try again shortly.");
      setState({ phase: "published", orangecatProjectId: ocId });
    }
  }

  if (state.phase === "loading" || state.phase === "unavailable") return null;

  if (state.phase === "published" || state.phase === "unpublishing") {
    const busy = state.phase === "unpublishing";
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <a
          href={`https://orangecat.ch/projects/${state.orangecatProjectId}`}
          target="_blank"
          rel="noreferrer"
          className="ui-btn-ghost min-h-11 gap-1.5"
          title="Published on OrangeCat — view public page"
          aria-label="View on OrangeCat"
        >
          <Cat className="h-4 w-4 text-accent-text" aria-hidden /> Published
        </a>
        {/* Publishing was one-way until 2026-09-11. The way back belongs next
            to the way out, not in a settings page the publisher never sees. */}
        <button
          type="button"
          onClick={() => void unpublish()}
          disabled={busy}
          className="ui-btn-text-cancel min-h-11 gap-1.5 text-xs"
          title="Set the OrangeCat project back to draft — it stops being public, and nothing is deleted"
        >
          {busy ? "Taking it down…" : "Take it down"}
        </button>
        {error && <span className="ui-error-xs">{error}</span>}
      </span>
    );
  }

  if (state.phase === "unlinked") {
    return (
      <button
        type="button"
        onClick={() => {
          window.location.href =
            "/sign-in?callbackUrl=" + encodeURIComponent(window.location.pathname);
        }}
        className="ui-btn-ghost min-h-11 gap-1.5"
        title="Publish to OrangeCat — connect your OrangeCat account first"
        aria-label="Connect OrangeCat to publish"
      >
        <Cat className="h-4 w-4" aria-hidden /> Publish
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={publish}
      disabled={state.phase === "publishing"}
      className="ui-btn-ghost min-h-11 gap-1.5"
      title="Publish to OrangeCat — public page + wall + funding"
      aria-label="Publish to OrangeCat"
    >
      <Cat
        className={`h-4 w-4 ${state.phase === "publishing" ? "animate-pulse" : ""}`}
        aria-hidden
      />
      {state.phase === "publishing" ? "Publishing…" : "Publish"}
    </button>
  );
}
