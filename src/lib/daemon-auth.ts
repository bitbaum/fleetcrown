import { NextRequest } from "next/server";
import { getDefaultUser } from "@/db/queries/users";

/** Returns true if the request carries a valid COCKPIT_DAEMON_TOKEN bearer credential. */
export function isDaemonRequest(req: NextRequest): boolean {
  const token = process.env.COCKPIT_DAEMON_TOKEN;
  return Boolean(token && (req.headers.get("authorization") ?? "") === `Bearer ${token}`);
}

/** Looks up the default user's ID for daemon-authenticated requests. */
export async function getDaemonUserId(): Promise<string | null> {
  const user = await getDefaultUser();
  return user?.id ?? null;
}
