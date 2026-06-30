"use client";

import { BuilderAgentView } from "./BuilderAgentView";

/** "This computer" terminal source — agents on the desktop Fleet Runner. */
export function LocalMachineView({
  initialTab,
  immersive = false,
}: {
  initialTab?: string | null;
  immersive?: boolean;
}) {
  return <BuilderAgentView variant="machine" initialTab={initialTab} immersive={immersive} />;
}
