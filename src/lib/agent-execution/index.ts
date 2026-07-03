/**
 * The active Executor for this FleetCrown process.
 *
 * Pinned to globalThis so the live-PTY registry is a true process-wide singleton
 * — Next.js re-evaluates modules (HMR, per-route module instances) and a plain
 * module-level instance would fork the registry, orphaning running agents. Same
 * pattern as the Drizzle/Prisma client singletons.
 *
 * Defaults to LocalPtyExecutor for dev/self-host. Set
 * FLEETCROWN_EXECUTOR=sandbox to use the Docker-backed SandboxExecutor; the
 * rest of the app depends only on the Executor interface.
 */
import { LocalPtyExecutor } from "./local-pty";
import { SandboxExecutor } from "./sandbox";
import type { Executor } from "./types";

const globalForExecutor = globalThis as unknown as { __fleetExecutor?: Executor };

function createExecutor(): Executor {
  return process.env.FLEETCROWN_EXECUTOR === "sandbox"
    ? new SandboxExecutor()
    : new LocalPtyExecutor();
}

export const executor: Executor =
  globalForExecutor.__fleetExecutor ?? (globalForExecutor.__fleetExecutor = createExecutor());

export * from "./types";
