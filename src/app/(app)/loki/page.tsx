import type { Metadata } from "next";
import { Suspense } from "react";
import { LokiWorkspace } from "@/components/loki/LokiWorkspace";
import { getSessionUserId } from "@/lib/session";
import { prefetchLokiWorkspace } from "@/lib/loki/prefetch";

export const metadata: Metadata = { title: "Loki" };

// Loki — start a project or continue one. Composer is the only decision;
// history and project pick live in drawers. Chat vs dispatch is resolved
// from the message (docs/loki-command-surface.md).
export default async function LokiPage() {
  const userId = await getSessionUserId();
  const seed = userId ? await prefetchLokiWorkspace(userId) : null;

  return (
    <div className="app-page ui-loki-page app-viewport-pane flex flex-col">
      <Suspense fallback={<div className="mx-auto h-full w-full max-w-5xl animate-pulse rounded-lg bg-surface-base" />}>
        <LokiWorkspace
          initialProjects={seed?.projects}
          initialConversations={seed?.conversations}
          loadErrors={
            seed
              ? {
                  projects: seed.projectsError,
                  conversations: seed.conversationsError,
                }
              : undefined
          }
        />
      </Suspense>
    </div>
  );
}
