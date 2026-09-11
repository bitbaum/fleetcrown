/**
 * The owned workspaces of one user, by tab name — the local-runtime answer to
 * "which projects have a live agent?" and "type this into that agent".
 *
 * There is no other terminal. A tab with no owned workspace has no agent; a
 * caller that needs one asks for a dispatch (cold start), it does not go
 * looking for a multiplexer tab to type into.
 */
import { executor } from "@/lib/agent-execution";
import { workspaceIdFor, ownsWorkspace } from "./ownership";

/**
 * Tabs with a live owned workspace. Workspace ids carry the project key in
 * lower case; `knownNames` restores the canonical casing callers key their
 * sentinel files and session handoffs by. Unknown ids come back as stored.
 */
export function listOwnedTabs(userId: string, knownNames: readonly string[] = []): string[] {
  const prefix = `${userId}:`;
  const byLower = new Map(knownNames.map((n) => [n.toLowerCase(), n]));
  return executor
    .list()
    .filter((h) => h.status !== "exited" && ownsWorkspace(userId, h.id))
    .map((h) => h.id.slice(prefix.length))
    .filter((key) => !key.includes(":")) // task workspaces (`<id>:task:<n>`) are not tabs
    .map((key) => byLower.get(key) ?? key);
}

/** The live workspace for a tab, or null. */
export function ownedWorkspaceFor(userId: string, tab: string) {
  const handle = executor.get(workspaceIdFor(userId, tab));
  return handle && handle.status !== "exited" ? handle : null;
}

export class NoLiveSessionError extends Error {
  constructor(tab: string) {
    super(`No running agent for "${tab}" — dispatch to start one`);
    this.name = "NoLiveSessionError";
  }
}

/** Submit a prompt to the tab's live agent. Throws NoLiveSessionError otherwise. */
export function injectOwned(userId: string, tab: string, prompt: string): void {
  const live = ownedWorkspaceFor(userId, tab);
  if (!live) throw new NoLiveSessionError(tab);
  executor.write(live.id, prompt.endsWith("\r") ? prompt : `${prompt}\r`);
}
