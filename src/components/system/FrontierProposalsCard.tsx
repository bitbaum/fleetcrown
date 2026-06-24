import { Lightbulb } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { listOpenProposals } from "@/db/queries/frontier";
import { ProposalRow } from "./ProposalRow";

/**
 * The self-improvement inbox. The daily frontier loop drafts proposals for how
 * FleetCrown should evolve, critiques them, and surfaces only those that clear
 * the bar here. The owner accepts (→ a roadmap goal) or dismisses; the loop
 * never builds on its own. Server-read — re-renders on page revalidation.
 */
export async function FrontierProposalsCard({ userId }: { userId: string }) {
  const proposals = await listOpenProposals(userId).catch(() => []);
  const right =
    proposals.length > 0
      ? <span className="text-xs font-medium text-accent-text">{proposals.length} to review</span>
      : <span className="text-xs text-text-tertiary">nothing pending</span>;

  return (
    <Card>
      <CardHeader icon={Lightbulb} title="Frontier proposals" right={right} />
      {proposals.length === 0 ? (
        <EmptyState>
          The fleet hasn&apos;t drafted new directions since you last reviewed. It mines each day&apos;s frontier digest for self-improvement ideas.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {proposals.map((p) => (
            <ProposalRow key={p.id} proposal={p} />
          ))}
        </ul>
      )}
    </Card>
  );
}
