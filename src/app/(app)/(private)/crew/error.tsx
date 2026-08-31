"use client";

import { RouteError } from "@/components/ui/route-error";

// Route-level error boundary for /crew — a throw while loading assignments
// keeps the shell + retry instead of the global boundary.
export default function CrewError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      route="crew"
      title="Crew"
      subtitle="Work handed to humans"
      cardTitle="Crew data unavailable"
      {...props}
    />
  );
}
