import type { Metadata } from "next";
import { AgentsCockpit } from "@/components/agents/AgentsCockpit";
import { PageTitle } from "@/components/ui/page-title";

export const metadata: Metadata = { title: "Agents" };

export default function AgentsPage() {
  return (
    <div className="app-page flex flex-col gap-3 md:gap-4">
      <div className="ui-page-header">
        <div>
          <PageTitle title="Agents" />
          <p className="ui-page-subtitle hidden sm:block">
            Your fleet at a glance — every agent&apos;s live status and the messages they send each other.
          </p>
        </div>
      </div>
      <AgentsCockpit />
    </div>
  );
}
