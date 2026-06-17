/**
 * The active Executor for this FleetCrown process.
 *
 * Pinned to globalThis so the live-PTY registry is a true process-wide singleton
 * — Next.js re-evaluates modules (HMR, per-route module instances) and a plain
 * module-level instance would fork the registry, orphaning running agents. Same
 * pattern as the Drizzle/Prisma client singletons.
 *
 * Today this is always LocalPtyExecutor. When the SandboxExecutor lands, this is
 * the one place that chooses the executor (per-tenant / per-environment) — the
 * rest of the app depends only on the Executor interface.
 */
import { LocalPtyExecutor } from "./local-pty";
import type { Executor } from "./types";

const globalForExecutor = globalThis as unknown as { __fleetExecutor?: Executor };

export const executor: Executor =
  globalForExecutor.__fleetExecutor ?? (globalForExecutor.__fleetExecutor = new LocalPtyExecutor());

export * from "./types";
