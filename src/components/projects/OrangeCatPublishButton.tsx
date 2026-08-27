"use client";

import { useEffect, useState } from "react";
import { Cat } from "lucide-react";

type PublishState =
  | { phase: "loading" }
  | { phase: "unavailable" } // no user_projects row (readonly/foreign project)
  | { phase: "unlinked" }
  | { phase: "unpublished" }
  | { phase: "publishing" }
  | { phase: "published"; orangecatProjectId: string };

/**
 * "Publish to OrangeCat" — opt-in per-project projection onto the OrangeCat
 * economic layer (cross-product bridge Part C). Once published, links to the
 * public OrangeCat project page; further dev-log entries auto-promote onto
 * its wall.
 */
export function OrangeCatPublishButton({ projectId }: { projectId: string }) {
  const [state, setState] = useState<PublishState>({ phase: "loading" });

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

  if (state.phase === "loading" || state.phase === "unavailable") return null;

  if (state.phase === "published") {
    return (
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
    );
  }

  if (state.phase === "unlinked") {
    return (
      <button
        type="button"
        onClick={() => {
          window.location.href = "/sign-in?callbackUrl=" + encodeURIComponent(window.location.pathname);
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
      <Cat className={`h-4 w-4 ${state.phase === "publishing" ? "animate-pulse" : ""}`} aria-hidden />
      {state.phase === "publishing" ? "Publishing…" : "Publish"}
    </button>
  );
}
