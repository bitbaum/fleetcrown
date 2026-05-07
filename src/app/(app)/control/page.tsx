import { PageLayout } from "@/components/ui/page-layout";
import { ControlPanel } from "@/components/control/ControlPanel";

export default function ControlPage() {
  return (
    <PageLayout title="Control" subtitle="Live agent state, project readiness, and next actions">
      <ControlPanel />
    </PageLayout>
  );
}
