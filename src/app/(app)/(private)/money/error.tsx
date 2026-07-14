"use client";

import { RouteError } from "@/components/ui/route-error";

// Route-level error boundary for /money — a throw while loading subscriptions
// or commitments keeps the shell + retry instead of the global boundary.
export default function MoneyError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      route="money"
      title="Money"
      subtitle="Subscriptions, bills, and financial commitments"
      cardTitle="Money data unavailable"
      {...props}
    />
  );
}
