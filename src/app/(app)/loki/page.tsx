import type { Metadata } from "next";
import { Suspense } from "react";
import { LokiWorkspace } from "@/components/loki/LokiWorkspace";
import { PageTitle } from "@/components/ui/page-title";

export const metadata: Metadata = { title: "Loki" };

// Loki — the conversational command surface (docs/loki-command-surface.md §4).
// One composer, a conversation list, a project filter; chat routes to Loki and
// commands dispatch into the project's agent session via the shared resolver.
export default function LokiPage() {
  return (
    <div className="app-page app-page-compact app-viewport-pane flex flex-col gap-2 md:gap-4">
      <div className="ui-page-header hidden sm:flex">
        <div>
          <PageTitle title="Loki" />
          <p className="ui-page-subtitle">
            Say what you want — Loki figures out which project and whether to chat or dispatch.
          </p>
        </div>
      </div>
      <Suspense fallback={null}>
        <LokiWorkspace />
      </Suspense>
    </div>
  );
}
