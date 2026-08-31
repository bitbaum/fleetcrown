"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, CardHeader } from "@/components/ui/card";

// Shared body for route-level error boundaries (error.tsx). Without one, a
// single server-component throw (e.g. a DB connectivity blip while loading
// the page's data) crashes the whole route into the generic global boundary
// with no retry context. With it, the shell + page title still render and the
// user gets actionable copy + a retry. Route files stay thin: they only
// supply the page's identity so the boundary matches the page it replaces.
export function RouteError({
  route,
  title,
  subtitle,
  cardTitle,
  error,
  reset,
}: {
  /** Route slug for the console log prefix, e.g. "money". */
  route: string;
  title: string;
  subtitle: string;
  cardTitle: string;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(`[${route}/error] caught:`, error);
  }, [route, error]);

  return (
    <PageLayout title={title} subtitle={subtitle}>
      <Card>
        <CardHeader icon={AlertCircle} title={cardTitle} />
        <p className="text-sm text-text-secondary">
          Couldn&apos;t load this page&apos;s data. This is usually a transient database hiccup; tap
          retry. If it persists, the underlying error digest is{" "}
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
