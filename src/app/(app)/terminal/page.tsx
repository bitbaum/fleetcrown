import type { Metadata } from "next";
import { TerminalSurface } from "@/components/terminal/TerminalSurface";
import { PageTitle } from "@/components/ui/page-title";
import { isRuntimeAvailable } from "@/lib/runtime";

export const metadata: Metadata = { title: "Terminal" };

// Two terminal sources behind one view (see TerminalSurface): server-owned PTYs
// ("This server") and the agents Fleet Runner runs on the user's machine
// ("My machine", streamed live via the peek channel). The latter is the
// runner-hosted local terminal that used to be "coming".
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
      <div className="min-h-0 flex-1">
        <TerminalSurface local={local} />
      </div>
    </div>
  );
}
