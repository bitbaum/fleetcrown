import type { Metadata } from "next";
import { Suspense } from "react";
import { TerminalPageClient } from "@/components/terminal/TerminalPageClient";
import { PageTitle } from "@/components/ui/page-title";
import { isRuntimeAvailable } from "@/lib/runtime";

export const metadata: Metadata = { title: "Terminal" };

export default function TerminalPage() {
  const local = isRuntimeAvailable();
  return (
    <div className="app-page app-page-compact app-viewport-pane flex flex-col gap-3 md:gap-4">
      <div className="ui-page-header">
        <div>
          <PageTitle title="Terminal" />
          <p className="ui-page-subtitle hidden sm:block">
            Shells on this server, or a live view of the agents running on your machine.
          </p>
        </div>
      </div>
      <Suspense fallback={<div className="ui-empty-page text-sm text-text-muted">Loading terminal…</div>}>
        <TerminalPageClient local={local} />
      </Suspense>
    </div>
  );
}
