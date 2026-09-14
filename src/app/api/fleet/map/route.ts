import { NextResponse } from "next/server";
import { loadFleetMap } from "@/lib/register/load-map";

/**
 * GET /api/fleet/map — the studio's projects with purpose, layer, state and
 * what is happening on each, derived from the same join as /api/fleet/register.
 *
 * PUBLIC on purpose, like the register: bitbaum renders it, the assistant's
 * knowledge index embeds it, Cat on OrangeCat may read it. Nothing here is
 * secret — purpose lines, public URLs, run outcomes and dev-log headlines the
 * owner already publishes on the project's page. Prices, tokens and paths stay
 * out, exactly as they do on the register.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const map = await loadFleetMap();
  if (!map) return NextResponse.json({ error: "no owner resolved" }, { status: 503 });
  return NextResponse.json(map, {
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" },
  });
}
