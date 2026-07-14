"use client";

import { RouteError } from "@/components/ui/route-error";

// Route-level error boundary for /system — a server-component throw (e.g.
// MemorySummaryCard's getEntityStats failing on a DB connectivity blip) keeps
// the shell + retry instead of the global boundary. Body lives in the shared
// RouteError component (also used by /money, /people, /goals).
export default function SystemError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      route="system"
      title="System"
      subtitle="Infrastructure health and Loki autopilot"
      cardTitle="System data unavailable"
      {...props}
    />
  );
}
