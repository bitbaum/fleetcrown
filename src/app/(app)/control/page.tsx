import { Suspense } from "react";
import { PageLayout } from "@/components/ui/page-layout";
import { ControlPanel } from "@/components/control/ControlPanel";
import { PullToRefresh } from "@/components/shared/PullToRefresh";

export const metadata = { title: "Control" };

export default function ControlPage() {
  return (
    <PullToRefresh>
      <PageLayout title="Control" subtitle="Live agent state, project readiness, and next actions">
        <Suspense fallback={null}>
          <ControlPanel />
        </Suspense>
      </PageLayout>
    </PullToRefresh>
  );
}
