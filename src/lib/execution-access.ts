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
    project?: ProjectLocus;
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
    /**
     * Pass the project instead of a precomputed defaultChannel and the decision
     * is made here, where presence is already loaded — one routing rule for
     * every caller rather than each route deriving its own.
     */
    project?: ProjectLocus;
  } = {},
): QueuedExecutionDecision {
  const requested = options.requestedChannel ?? null;
  const defaultChannel =
    options.defaultChannel ?? ("project" in options ? pickDispatchChannel(options.project, access.presence) : undefined);

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
 * Locus plus a caller-supplied fallback, for the paths that have no presence to
 * consult. Prefer `pickDispatchChannel` wherever presence IS available — it is
 * the real routing rule; this is the degenerate case of it.
 *
 * The return type is deliberately NOT nullable. An absent channel does not mean
 * "any builder, pick a good one" — it means the row is claimable by ALL of them
 * concurrently, which is a race the always-on box loses to whichever desktop is
 * polling. Callers used to spread `...(ch ? {channel: ch} : {})` and silently
 * emit unrouted commands; making null unrepresentable here is what stops that
 * from coming back.
 */
export function projectPreferredChannel(
  project: ProjectLocus,
  fallback: RunnerChannel = DEFAULT_BUILDER_CHANNEL,
): RunnerChannel {
  return projectChannelLock(project) ?? fallback;
}

export type ProjectLocus = { dirPath?: string | null; gitUrl?: string | null } | null | undefined;

/**
 * Physics, not preference: the ONE channel that can materialize this project,
 * or null when either could.
 *
 * Separated from the routing policy below because a lock must never lose to a
 * presence check. Routing "this project is only on your laptop" to the cloud
 * because the laptop is asleep would re-create the 2026-07-14 misroute — the
 * cloud builder clone-fails and hands the agent an empty directory to "work" in.
 * A locked dispatch waits for its machine. That is correct: there is nowhere
 * else for it to go.
 */
export function projectChannelLock(project: ProjectLocus): RunnerChannel | null {
  if (project?.dirPath && !isCloneableGitUrl(project.gitUrl)) return "local";
  return null;
}

/**
 * Where should this dispatch run? The single answer for every caller.
 *
 * Local and cloud are two different products, not two servers. Local runs in the
 * operator's own checkout, so they watch it happen and keep their env; cloud
 * runs in a fresh clone on the always-on box and returns work only through git.
 * So the question is not "which machine is better" but "is the operator here?"
 *
 * Presence answers that without asking. A connected desktop builder means they
 * are at the machine — run it in their tree where they can see it. No desktop
 * means they are away (asleep, lid shut, on their phone) — hand it to the box so
 * the work still happens instead of waiting for a laptop that may not open until
 * tomorrow. This is the behavior the product already promises in
 * EXECUTOR_COPY.inject.hostedFallback; it just wasn't wired.
 *
 * Ordering is deliberate: lock (physics) → local (operator present) → cloud
 * (operator away) → floor (nobody home; queue for the primary and say so).
 */
export function pickDispatchChannel(
  project: ProjectLocus,
  presence: BuilderChannelPresence,
): RunnerChannel {
  const lock = projectChannelLock(project);
  if (lock) return lock;
  if (presence.local) return "local";
  if (presence.cloud) return "cloud";
  return DEFAULT_BUILDER_CHANNEL;
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
