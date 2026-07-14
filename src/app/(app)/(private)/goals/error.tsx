"use client";

import { RouteError } from "@/components/ui/route-error";

// Route-level error boundary for /goals — a throw while loading the goal tree
// keeps the shell + retry instead of the global boundary.
export default function GoalsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      route="goals"
      title="Goals"
      subtitle="Where you're going — and how you're getting there"
      cardTitle="Goals data unavailable"
      {...props}
    />
  );
}
