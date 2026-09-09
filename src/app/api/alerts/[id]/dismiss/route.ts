import { NextRequest, NextResponse } from "next/server";
import { getApiUserId } from "@/lib/session";
import { dismissAlert } from "@/db/queries/alerts";
import { jsonOk, jsonError } from "@/lib/api/route-helpers";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const userId = getApiUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const { id } = await props.params;
  const result = await dismissAlert(id, userId);

  if (result.length === 0) {
    return jsonError("Alert not found or already dismissed", 404);
  }

  return jsonOk({ dismissed: true });
}
