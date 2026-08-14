import { getUserProjectByEntityId } from "@/db/queries/user-projects";
import { fetchAttributesByEntityIds } from "@/db/queries/utils";

/**
 * Public site origin for a project. SSOT precedence matches getProjectLinks:
 * user_projects.liveUrl (Hetzner / Caddy) wins over legacy entity attrs.
 * Never prefer a stale *.vercel.app attr when liveUrl is set.
 */
export async function resolveProjectPublicOrigin(
  userId: string,
  projectId: string,
): Promise<string | null> {
  const [up, attrsMap] = await Promise.all([
    getUserProjectByEntityId(userId, projectId),
    fetchAttributesByEntityIds([projectId]),
  ]);
  const attrs = attrsMap.get(projectId) ?? {};
  const raw = up?.liveUrl || attrs.production_url || attrs.url || null;
  if (!raw) return null;
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).origin;
  } catch {
    return null;
  }
}

/** Repo the agent can change: entity column or linked user_projects row. */
export async function resolveProjectRepoTarget(
  userId: string,
  projectId: string,
): Promise<{ gitUrl: string | null; dirPath: string | null }> {
  const up = await getUserProjectByEntityId(userId, projectId);
  return {
    gitUrl: up?.gitUrl ?? null,
    dirPath: up?.dirPath ?? null,
  };
}
