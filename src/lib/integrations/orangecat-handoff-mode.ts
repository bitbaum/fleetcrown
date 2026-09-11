/**
 * What the OrangeCat → FleetCrown build handoff does on arrival.
 *
 * The default is to build: consume the intent, create the project, and land on
 * it with the kickoff already running (profile → milestones → repository →
 * agent). That is the one click the "Build it with FleetCrown" button
 * promises. Two cases must NOT auto-create:
 *
 *   - `connected`: this entity already has a FleetCrown project. Creating a
 *     second one is the duplicate the picker exists to prevent; open the one
 *     that exists.
 *   - `exactMatch`: a project with the same name exists but is not linked.
 *     "Bitbaum" on both products is almost certainly one thing; only a person
 *     can say so. Show the picker.
 *
 * `review` is the operator's explicit request to choose first (`?review=1`).
 * Pure so the rule is pinned by a test rather than by reading JSX.
 */
export type HandoffMode = "auto" | "review" | "connected";

export function decideHandoffMode(input: {
  review: boolean;
  connected: boolean;
  exactMatch: boolean;
}): HandoffMode {
  if (input.connected) return "connected";
  if (input.review || input.exactMatch) return "review";
  return "auto";
}

/** Query flag the project page reads to start the kickoff without a click. */
export const KICKOFF_AUTO_PARAM = "kickoff";
export const KICKOFF_AUTO_VALUE = "auto";

/** The project URL the API returned, with the auto-kickoff flag appended. */
export function kickoffAutoHref(projectUrl: string): string {
  const sep = projectUrl.includes("?") ? "&" : "?";
  return `${projectUrl}${sep}${KICKOFF_AUTO_PARAM}=${KICKOFF_AUTO_VALUE}`;
}

export function isKickoffAuto(value: string | string[] | undefined): boolean {
  return value === KICKOFF_AUTO_VALUE;
}
