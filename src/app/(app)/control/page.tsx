import { PageLayout } from "@/components/ui/page-layout";
import { ControlPanel } from "@/components/control/ControlPanel";

export default function ControlPage() {
  return (
    <PageLayout title="Control" subtitle="Dispatch AI agents across your projects — pick an intent and fire">
      <ControlPanel />
    </PageLayout>
  );
}
