/**
 * Inline tests for Loki project selection helper.
 * Run: npx tsx scripts/test/loki-prefetch.ts
 */
import { resolveLokiProjectSelection } from "@/lib/loki/project-selection";
import type { LokiProject } from "@/components/loki/types";

const projects: LokiProject[] = [
  { id: "1", name: "fleetcrown", topGoal: null },
  { id: "2", name: "kivvi", topGoal: null },
];

if (
  JSON.stringify(resolveLokiProjectSelection(projects, "fleetcrown")) !==
  JSON.stringify(["fleetcrown"])
) {
  throw new Error("named project select");
}
if (JSON.stringify(resolveLokiProjectSelection(projects, null)) !== JSON.stringify([])) {
  throw new Error("multi project no auto select");
}
if (
  JSON.stringify(resolveLokiProjectSelection([projects[0]], null)) !==
  JSON.stringify(["fleetcrown"])
) {
  throw new Error("single project auto select");
}

console.log("✓ loki-prefetch tests passed");
