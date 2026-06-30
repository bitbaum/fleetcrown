/**
 * /api/metrics — operator dashboard endpoint.
 *
 * Returns a JSON snapshot of FleetCrown's last 24h activity for the
 * signed-in user. Auth: same session check as every /api route; non-
 * authenticated → 401. There's no separate "operator role" — every user
 * sees their own metrics.
 *
 * Format is JSON (not Prometheus text) because we don't have a Prometheus
 * scraper and adding one for a single-user product is YAGNI. When/if we
 * ever bolt a scraper on, this endpoint can grow a `?format=prom` knob.
 *
 * Caching: no-store. Metrics are real-time by definition; serving stale
 * data is a footgun for the 2-AM-debugging case this exists to serve.
 *
 * Performance: 6 parallel queries against well-indexed columns
 * (user_id + created_at). On a healthy DB returns in <50ms.
 */

import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import {
  getDispatchMetrics,
  getRunMetrics,
  getErrorLogMetrics,
  getTokenMetrics,
  getRunnerMetrics,
  getProjectMetrics,
} from "@/db/queries/metrics";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [dispatch, runs, errors, tokens, runner, projects] = await Promise.all([
    getDispatchMetrics(userId),
    getRunMetrics(userId),
    getErrorLogMetrics(),
    getTokenMetrics(userId),
    getRunnerMetrics(userId),
    getProjectMetrics(userId),
  ]);

  return NextResponse.json(
    {
      capturedAt: new Date().toISOString(),
      window: "24h",
      dispatch,
      runs,
      errors,
      tokens,
      runner,
      projects,
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" } },
  );
}
