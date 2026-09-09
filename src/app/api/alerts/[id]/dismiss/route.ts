import { NextRequest } from "next/server";
import { getApiUserId } from "@/lib/session";
import { dismissAlert } from "@/db/queries/alerts";
import { jsonOk, jsonError } from "@/lib/api/route-helpers";

export async function PATCH(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const userId = await getApiUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const params = await props.params;
  const result = await dismissAlert(params.id, userId);

  if (result.length === 0) {
    return jsonError("Alert not found or already dismissed", 404);
  }

  return jsonOk({ dismissed: true });
}
