import type { Metadata } from "next";
import { LokiWorkspace } from "@/components/loki/LokiWorkspace";

export const metadata: Metadata = { title: "Loki" };

// Loki — the conversational command surface (docs/loki-command-surface.md §4).
// One composer, a conversation list, a project filter; chat routes to Loki and
// commands dispatch into the project's agent session via the shared resolver.
export default function LokiPage() {
  // Fill the visible area exactly so the composer sits at the bottom without
  // page scroll. On mobile, leave room for the floating bottom nav (the
  // --mobile-chrome-bottom token) and the top bar; on md+ the sidebar layout
  // makes the simple inset enough.
  return (
    <div className="app-page flex h-[calc(100svh-var(--mobile-chrome-bottom)-3.25rem)] flex-col gap-2 md:h-[calc(100dvh-2rem)] md:gap-4">
      {/* Compact header — the subtitle is desktop-only so the chat keeps the
          vertical space on phones (modern chat surfaces don't title the page). */}
      <div className="ui-page-header">
        <div>
          <h1 className="ui-page-title">Loki</h1>
          <p className="ui-page-subtitle hidden sm:block">
            Say what you want — Loki figures out which project and whether to chat or dispatch.
          </p>
        </div>
      </div>
      <LokiWorkspace />
    </div>
  );
}
