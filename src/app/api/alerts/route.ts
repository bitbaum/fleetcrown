import { getApiUserId } from "@/lib/session";
import { getActiveAlerts } from "@/db/queries/alerts";
import { jsonOk, jsonError } from "@/lib/api/route-helpers";

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const alerts = await getActiveAlerts(userId);
  return jsonOk({ alerts });
}
