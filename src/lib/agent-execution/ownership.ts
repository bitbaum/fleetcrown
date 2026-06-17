/**
 * Workspace id scheme + ownership. A workspace id is `${userId}:${projectKey}` —
 * a stable, FleetCrown-assigned handle (never a terminal/session name), namespaced
 * by user so the streaming/input routes can authorize by simple prefix without a
 * DB lookup. Multi-tenant safe: a user can only address workspaces they own.
 */
export function workspaceIdFor(userId: string, projectKey: string): string {
  return `${userId}:${projectKey.toLowerCase()}`;
}

export function ownsWorkspace(userId: string, workspaceId: string): boolean {
  return workspaceId.startsWith(`${userId}:`);
}
