import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { WORKSPACES_CLOUD_DISABLED } from "@/lib/runtime";

export function WorkspaceUnavailable({ error, code }: { error: string; code?: string }) {
  const message = error || WORKSPACES_CLOUD_DISABLED;

  return (
    <div className="app-page app-page-compact app-viewport-pane flex flex-col gap-4">
      <Link href="/control" className="ui-btn-ghost ui-btn-xs self-start gap-1.5">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Control
      </Link>
      <div>
        <h1 className="ui-page-title">Workspace terminal</h1>
        <p className="ui-page-subtitle mt-1">
          Server-owned PTY workspaces are not available on this host.
        </p>
      </div>
      <div className="ui-callout-warning">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
        <div className="space-y-3 text-sm leading-relaxed text-text-secondary">
          <p>{message}</p>
          <p>
            Use{" "}
            <Link href="/terminal" className="text-accent-text underline">
              Terminal
            </Link>{" "}
            → Cloud or This computer to watch and type into agent sessions, or dispatch from{" "}
            <Link href="/control" className="text-accent-text underline">
              Control
            </Link>{" "}
            /{" "}
            <Link href="/loki" className="text-accent-text underline">
              Loki
            </Link>
            .
          </p>
          {code === "cloud-builder-private" && (
            <p>
              Hosted sandboxes are private beta — connect{" "}
              <Link href="/download" className="text-accent-text underline">
                Fleet Runner
              </Link>{" "}
              on this computer for the default execution path.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
