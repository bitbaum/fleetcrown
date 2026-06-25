import type { Metadata } from "next";
import { LokiWorkspace } from "@/components/loki/LokiWorkspace";

export const metadata: Metadata = { title: "Loki" };

// Loki — the conversational command surface (docs/loki-command-surface.md §4).
// One composer, a conversation list, a project filter; chat routes to Loki and
// commands dispatch into the project's agent session via the shared resolver.
export default function LokiPage() {
  return (
    <div className="app-page flex h-[calc(100dvh-2rem)] flex-col gap-4">
      <div className="ui-page-header">
        <div>
          <h1 className="ui-page-title">Loki</h1>
          <p className="ui-page-subtitle">
            Say what you want — Loki figures out which project and whether to chat or dispatch.
          </p>
        </div>
      </div>
      <LokiWorkspace />
    </div>
  );
}
