import { ROUTES, SITE_PREVIEW_PARAM } from "@/config/auth";

/** Inputs the landing page has already resolved before it decides what to render. */
export type LandingContext = {
  /** Request came from the Fleet Runner desktop shell (UA marker). */
  insideRunner: boolean;
  /** Session exists AND onboarding is finished. */
  signedIn: boolean;
  /** Raw `searchParams` of the request. */
  params: Record<string, string | string[] | undefined>;
};

/**
 * Where a visitor to "/" should actually end up.
 *
 * Fleet Runner starts with the OS and loads APP_URL with no path, so a
 * signed-in operator's first sight of the day was the marketing hero — a pitch
 * written for a stranger, which suggests nothing to do and costs a click before
 * any agent can be launched. Inside the runner, a signed-in operator goes to
 * the command deck instead.
 *
 * Returns null when the marketing page is the correct answer: every browser
 * visitor, anyone signed out (they still need the pitch and the sign-in path),
 * and a runner operator who asked for the site on purpose with `?site`.
 */
export function landingRedirect(ctx: LandingContext): string | null {
  if (!ctx.insideRunner || !ctx.signedIn) return null;
  if (ctx.params[SITE_PREVIEW_PARAM] !== undefined) return null;
  return ROUTES.RUNNER_HOME;
}
