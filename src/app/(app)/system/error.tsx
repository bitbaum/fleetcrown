"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, CardHeader } from "@/components/ui/card";

// Route-level error boundary for /system. Without this, a single server-
// component throw (e.g. MemorySummaryCard's getEntityStats failing on a
// DB connectivity blip) crashed the entire route into the generic
// "Something went wrong" global boundary with no retry context. Now the
// shell + title + retry button still render, and the user gets actionable
// copy instead of a black-box server error.
export default function SystemError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[system/error] caught:", error);
  }, [error]);

  return (
    <PageLayout title="System" subtitle="Infrastructure health and Ivy autopilot">
      <Card>
        <CardHeader icon={AlertCircle} title="System data unavailable" />
        <p className="text-sm text-text-secondary">
          Couldn&apos;t load one of the System sections. This is usually a transient database hiccup;
          tap retry. If it persists, the underlying error digest is{" "}
          <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-xs">
            {error.digest ?? "n/a"}
          </code>
          .
        </p>
        <button onClick={reset} className="ui-btn-secondary mt-3">
          Retry
        </button>
      </Card>
    </PageLayout>
  );
}
