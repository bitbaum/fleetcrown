import { getExecutionAccess } from "@/lib/execution-access";
import {
  isRuntimeAvailable,
  isSandboxExecutorEnabled,
  WORKSPACES_CLOUD_DISABLED,
} from "@/lib/runtime";

export type WorkspaceAccessDecision =
  | { ok: true }
  | {
      ok: false;
      status: 403;
      error: string;
      code: "server-workspaces-disabled" | "cloud-builder-private";
    };

export function decideWorkspaceAccessFromSignals(input: {
  runtimeAvailable: boolean;
  sandboxExecutorEnabled: boolean;
  cloudBuilderAllowed: boolean;
}): WorkspaceAccessDecision {
  if (input.runtimeAvailable) return { ok: true };
  if (!input.sandboxExecutorEnabled) {
    return {
      ok: false,
      status: 403,
      code: "server-workspaces-disabled",
      error: WORKSPACES_CLOUD_DISABLED,
    };
  }
  if (!input.cloudBuilderAllowed) {
    return {
      ok: false,
      status: 403,
      code: "cloud-builder-private",
      error:
        "Hosted sandbox workspaces are private for this account. Connect Fleet Runner on this computer to run agent work.",
    };
  }
  return { ok: true };
}

/**
 * Server-owned workspaces are available in two cases:
 * - local/self-host runtime (`RUNTIME_AVAILABLE=true`);
 * - hosted sandbox runtime (`FLEETCROWN_EXECUTOR=sandbox`) for cloud-builder-
 *   allowed accounts only.
 */
export async function decideWorkspaceAccess(userId: string): Promise<WorkspaceAccessDecision> {
  const runtimeAvailable = isRuntimeAvailable();
  const sandboxExecutorEnabled = isSandboxExecutorEnabled();
  if (runtimeAvailable || !sandboxExecutorEnabled) {
    return decideWorkspaceAccessFromSignals({
      runtimeAvailable,
      sandboxExecutorEnabled,
      cloudBuilderAllowed: false,
    });
  }
  const access = await getExecutionAccess(userId);
  return decideWorkspaceAccessFromSignals({
    runtimeAvailable,
    sandboxExecutorEnabled,
    cloudBuilderAllowed: access.cloudBuilderAllowed,
  });
}
