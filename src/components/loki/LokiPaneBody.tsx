"use client";

import type { ReactNode } from "react";

/** Shared loading / error / empty shell for Loki side panes. */
export function LokiPaneBody({
  loading,
  error,
  onRetry,
  children,
}: {
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (loading) return <p className="ui-loki-convo-meta px-3">Loading…</p>;
  if (error) {
    return (
      <div className="flex flex-col gap-2 px-3">
        <p className="ui-error text-xs">{error}</p>
        {onRetry && (
          <button type="button" className="ui-btn-chip self-start" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    );
  }
  return children;
}
