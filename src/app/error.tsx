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
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-white/50 gap-4 p-8">
      <AlertCircle className="h-12 w-12 text-red-400/60" />
      <div className="text-lg font-semibold">Something went wrong</div>
      <div className="text-sm text-white/30 max-w-md text-center">
        {error.message || "An unexpected error occurred."}
      </div>
      <button
        onClick={reset}
        className="mt-2 px-4 py-2 text-sm rounded-md border border-white/10 hover:bg-white/5 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
