import type { Metadata } from "next";
import { TerminalWorkspace } from "@/components/terminal/TerminalWorkspace";

export const metadata: Metadata = { title: "Terminal" };

// Local terminals run on FleetCrown-owned PTYs (LocalPtyExecutor + node-pty),
// so this surface is live wherever the app runs locally / inside Fleet Runner.
export default function TerminalPage() {
  return (
    <div className="app-page flex h-[calc(100dvh-2rem)] flex-col gap-4">
      <div className="ui-page-header">
        <div>
          <h1 className="ui-page-title">Terminal</h1>
          <p className="ui-page-subtitle">Local shells on your machine — multi-tab, split into panes.</p>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <TerminalWorkspace />
      </div>
    </div>
  );
}
