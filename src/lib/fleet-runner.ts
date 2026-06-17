import { headers } from "next/headers";

/** UA marker the Fleet Runner desktop shell appends to every request's
 *  User-Agent (see desktop/src/main/index.ts → session.setUserAgent). This is
 *  the single source of truth for "this request originates inside the desktop
 *  app", so server components can drop the circular "Download Fleet Runner"
 *  CTAs that make no sense once you are already running the runner. */
export const FLEET_RUNNER_UA_MARKER = "FleetRunner/";

/** Server-side counterpart to the client `useInsideFleetRunner` hook. Reads the
 *  request User-Agent, so it is flash-free (the decision is made before the
 *  HTML is sent) and works in React Server Components. Note: calling this opts
 *  the route into dynamic rendering — only use it on pages that are already
 *  dynamic or where correctness beats static caching. */
export async function isFleetRunnerRequest(): Promise<boolean> {
  const ua = (await headers()).get("user-agent") ?? "";
  return ua.includes(FLEET_RUNNER_UA_MARKER);
}
