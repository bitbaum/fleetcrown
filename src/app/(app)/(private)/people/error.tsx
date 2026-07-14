"use client";

import { RouteError } from "@/components/ui/route-error";

// Route-level error boundary for /people — a throw while loading the contact
// graph keeps the shell + retry instead of the global boundary.
export default function PeopleError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      route="people"
      title="People"
      subtitle="Your social graph"
      cardTitle="People data unavailable"
      {...props}
    />
  );
}
