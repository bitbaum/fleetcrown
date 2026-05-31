import { Suspense } from "react";
import { PageLayout } from "@/components/ui/page-layout";
import { ControlPanel } from "@/components/control/ControlPanel";
import { PullToRefresh } from "@/components/shared/PullToRefresh";

export const metadata = { title: "Control" };

export default function ControlPage() {
  return (
    <PullToRefresh>
      {/* Subtitle dropped 2026-05-31 — "Live agent state, project readiness,
          and next actions" was meaningless preamble taking space the daemon-
          status banner needs. Title alone is enough; the chip strip + banner
          below tell the user what's actually happening. */}
      <PageLayout title="Control">
        <Suspense fallback={null}>
          <ControlPanel />
        </Suspense>
      </PageLayout>
    </PullToRefresh>
  );
}
