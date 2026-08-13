"use client";

import { RouteError } from "@/components/ui/route-error";

export default function RobotsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      route="robots"
      title="Robots"
      subtitle="Machines you own"
      cardTitle="Robots data unavailable"
      {...props}
    />
  );
}
