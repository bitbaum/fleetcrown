/**
 * One-click project dispatch kinds — SSOT for the union that was previously
 * declared in ProjectActionButtons (client hook), the dispatch route's zod
 * schema, and its composePrompt signature. Plain constants module so both
 * client components and API routes can import it.
 */
export const PROJECT_DISPATCH_KINDS = [
  "fix_signal",
  "next_step",
  "diagnose_timeouts",
  "kickoff",
] as const;
export type ProjectDispatchKind = (typeof PROJECT_DISPATCH_KINDS)[number];
