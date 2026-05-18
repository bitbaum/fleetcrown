"use client";

import { AlertCircle } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="ui-empty-page p-8">
      <div className="ui-card-shell-raised flex max-w-2xl flex-col items-center gap-5 px-8 py-10 text-center">
        <AlertCircle className="h-14 w-14 text-status-negative" />
        <div className="text-2xl font-medium text-text-primary">Something went wrong</div>
        <div className="max-w-xl text-lg text-text-secondary">
          {error.message || "An unexpected error occurred."}
        </div>
        <button
          onClick={reset}
          className="ui-btn-chip rounded-2xl px-5 py-3 text-base text-text-primary"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
