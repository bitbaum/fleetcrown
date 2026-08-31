/**
 * Layer 2 of the demo sandbox — the asserts that sit at the effects themselves.
 *
 * Layer 1 (the route policy in src/config/demo.ts, applied by the authorized()
 * callback) answers "may this REQUEST proceed?". It is a list of paths, and
 * lists rot: someone adds a route, or widens a carve-out to unblock a demo bug,
 * and the box is suddenly reachable.
 *
 * This layer answers a different question — "may this USER cause this EFFECT?"
 * — at the only places the effect can actually happen: enqueuePendingCommand,
 * which is the one row Fleet Runner polls to type into a real shell, and the
 * paid RAG reindex. It does not import the route policy,
 * so no edit to that list can weaken it. Two layers, two failure modes.
 *
 * Server-only: touches the database. Never import from middleware or a client
 * component — src/config/demo.ts holds the pure half that the edge runtime uses.
 */
import { NextResponse } from "next/server";
import { getUserByEmail } from "@/db/queries/users";
import { DEMO_EMAIL, DEMO_DENIAL_COPY, isDemoEnabled, type DemoDenialReason } from "@/config/demo";

/**
 * Thrown when the demo account attempts an effect that leaves its tenant.
 * Carries the reason so the route can answer with copy a human understands
 * rather than a bare 403.
 */
export class DemoBlockedError extends Error {
  readonly reason: DemoDenialReason;
  constructor(reason: DemoDenialReason) {
    super(DEMO_DENIAL_COPY[reason]);
    this.name = "DemoBlockedError";
    this.reason = reason;
  }
}

/**
 * The demo user's id, or null when the demo is off / not seeded.
 *
 * Memoized because this sits on hot paths (every dispatch, every send) and the
 * answer changes only when the nightly reset re-mints the row. The reset clears
 * the cache explicitly via forgetDemoUserId() — without that, a reset would
 * leave every running process authorising against a userId that no longer
 * exists, which is the identity-orphaning bug this fleet has already shipped
 * once (see the reset-that-remints-identity note in the reset route).
 */
let cachedDemoUserId: string | null | undefined;

export async function getDemoUserId(): Promise<string | null> {
  if (!isDemoEnabled()) return null;
  if (cachedDemoUserId !== undefined) return cachedDemoUserId;
  const user = await getUserByEmail(DEMO_EMAIL);
  cachedDemoUserId = user?.id ?? null;
  return cachedDemoUserId;
}

/** Drop the memoized id. Called by the nightly reset after it re-seeds. */
export function forgetDemoUserId(): void {
  cachedDemoUserId = undefined;
}

export async function isDemoUserId(userId: string | null | undefined): Promise<boolean> {
  if (!userId || !isDemoEnabled()) return false;
  return userId === (await getDemoUserId());
}

/**
 * Refuse an effect for the demo account. Call this INSIDE the function that
 * performs the effect, not in the route that leads to it — a route can be
 * bypassed by a server action, a queue drain or the next caller nobody thought
 * about; the effect cannot bypass itself.
 */
export async function requireNotDemo(
  userId: string | null | undefined,
  reason: DemoDenialReason,
): Promise<void> {
  if (await isDemoUserId(userId)) throw new DemoBlockedError(reason);
}

/**
 * Same check for fire-and-forget paths that must not throw — a background
 * reindex or a heartbeat should quietly skip for the demo rather than surface
 * an error to a visitor who did nothing wrong.
 */
export async function skipForDemo(userId: string | null | undefined): Promise<boolean> {
  return isDemoUserId(userId);
}

/** 403 with copy the UI can show verbatim. */
export function demoDeniedResponse(reason: DemoDenialReason): NextResponse {
  return NextResponse.json(
    { error: DEMO_DENIAL_COPY[reason], demoBlocked: true, reason },
    { status: 403 },
  );
}

/**
 * Route-handler helper for the families the proxy matcher excludes (see
 * DEMO_HANDLER_ENFORCED). Returns a response to return, or null to continue.
 */
export async function denyDemoInHandler(
  userId: string | null | undefined,
  reason: DemoDenialReason,
): Promise<NextResponse | null> {
  return (await isDemoUserId(userId)) ? demoDeniedResponse(reason) : null;
}

/**
 * The password routes need the check BEFORE a session exists — a reset is
 * requested by email, not by session. Pure string compare, no DB.
 */
export function isDemoEmailBlocked(email: string | null | undefined): boolean {
  return isDemoEnabled() && typeof email === "string" && email.trim().toLowerCase() === DEMO_EMAIL;
}
