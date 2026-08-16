import type { RunnerChannel } from "@/db/schema/pending-commands";
import type { BuilderChannelPresence } from "@/lib/builder-presence";
import { isCloneableGitUrl } from "@/lib/git-url";
import { DEFAULT_BUILDER_CHANNEL } from "@/lib/constants/statuses";

const CLOUD_BUILDER_PRIVATE_MESSAGE =
  "Cloud builder access is private for this account. Connect Fleet Runner on this computer to run agent work.";

const BUILDER_REQUIRED_MESSAGE =
  "No builder is connected for this account. Open Fleet Runner on this computer, then dispatch again.";

function cloudBuilderAllowlist(): Set<string> {
  return new Set(
    (process.env.FLEETCROWN_CLOUD_BUILDER_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export type ExecutionAccess = {
  userId: string;
  cloudBuilderAllowed: boolean;
  presence: BuilderChannelPresence;
};

export type QueuedExecutionDecision =
  | {
      ok: true;
      channel?: RunnerChannel;
      runnerConnected: boolean;
      access: ExecutionAccess;
    }
  | {
      ok: false;
      status: 403 | 409;
      code: "cloud-builder-private" | "builder-required";
      message: string;
      access: ExecutionAccess;
    };

export async function getExecutionAccess(userId: string): Promise<ExecutionAccess> {
  const [{ getUserById }, { getBuilderPresence }] = await Promise.all([
    import("@/db/queries/users"),
    import("@/db/queries/runner-presence"),
  ]);
  const [user, presence] = await Promise.all([
    getUserById(userId),
    getBuilderPresence(userId).catch(() => ({ cloud: false, local: false, any: false })),
  ]);
  const cloudBuilderAllowed =
    !!user?.isDefault || cloudBuilderAllowlist().has(userId);
  return { userId, cloudBuilderAllowed, presence };
}

/**
 * SSOT for queued execution routing on the hosted web app.
 *
 * The always-on box-runner is not a tenant boundary. Until hosted execution is
 * sandboxed per tenant, non-founder accounts must run work through their own
 * Fleet Runner ("local" channel) instead of the shared cloud builder.
 */
export async function resolveQueuedExecution(
  userId: string,
  options: {
    requestedChannel?: RunnerChannel | null;
    defaultChannel?: RunnerChannel;
  } = {},
): Promise<QueuedExecutionDecision> {
  const access = await getExecutionAccess(userId);
  return decideQueuedExecution(access, options);
}

export function decideQueuedExecution(
  access: ExecutionAccess,
  options: {
    requestedChannel?: RunnerChannel | null;
    defaultChannel?: RunnerChannel;
  } = {},
): QueuedExecutionDecision {
  const requested = options.requestedChannel ?? null;
  const defaultChannel = options.defaultChannel;

  if (!access.cloudBuilderAllowed) {
    if (requested === "cloud") {
      return {
        ok: false,
        status: 403,
        code: "cloud-builder-private",
        message: CLOUD_BUILDER_PRIVATE_MESSAGE,
        access,
      };
    }
    if (access.presence.local) {
      return {
        ok: true,
        channel: "local",
        runnerConnected: true,
        access,
      };
    }
    return {
      ok: false,
      status: 409,
      code: "builder-required",
      message: BUILDER_REQUIRED_MESSAGE,
      access,
    };
  }

  const channel = requested ?? defaultChannel;
  const runnerConnected = channel
    ? access.presence[channel]
    : access.presence.any;
  return {
    ok: true,
    ...(channel ? { channel } : {}),
    runnerConnected,
    access,
  };
}

/**
 * Which channel can actually MATERIALIZE this project's workspace?
 *
 * A dispatch whose project has a local dirPath but NO cloneable GitHub gitUrl
 * can only execute on the machine that has the directory — the cloud builder
 * would clone-fail and (before 2026-07-14, silently) invent an empty dir for
 * the agent to "work" in. Locus is a property of the task: pin such dispatches
 * to "local". Projects with a cloneable repo (or no dirPath at all) can be
 * obtained by any builder, so they take the fallback — DEFAULT_BUILDER_CHANNEL
 * unless a caller has a specific reason to say otherwise.
 *
 * The return type is deliberately NOT nullable. An absent channel does not mean
 * "any builder, preferably cloud" — it means the row is claimable by ALL of
 * them concurrently, which is a race the always-on box loses to whichever
 * desktop is polling. Callers used to spread `...(ch ? {channel: ch} : {})` and
 * silently emit unrouted commands; making null unrepresentable here is what
 * stops that from coming back.
 */
export function projectPreferredChannel(
  project: { dirPath?: string | null; gitUrl?: string | null } | null | undefined,
  fallback: RunnerChannel = DEFAULT_BUILDER_CHANNEL,
): RunnerChannel {
  if (project?.dirPath && !isCloneableGitUrl(project.gitUrl)) return "local";
  return fallback;
}

export function executionAccessErrorBody(decision: Extract<QueuedExecutionDecision, { ok: false }>) {
  return {
    ok: false,
    error: decision.message,
    code: decision.code,
    warning: decision.code,
    cloudBuilderAllowed: decision.access.cloudBuilderAllowed,
    builderPresence: decision.access.presence,
  };
}
