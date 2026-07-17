/**
 * Window-level CustomEvent names used to coordinate state across detached
 * client components in the browser. SSOT so producer and listener can't drift.
 *
 * Distinct from `src/lib/events.ts` — that file owns the Worker/Bridge/Brain
 * JSONL event-log schema (a server-side concept). This file is purely for
 * runtime DOM events fired through `window`.
 *
 * Producers: `window.dispatchEvent(new CustomEvent(NAME))`
 * Listeners: `window.addEventListener(NAME, handler)` — keep handlers idempotent.
 */

/** Fired by PullToRefresh on a successful commit. useFetch listens and bumps
 *  its revision so client-side polls refetch in lockstep with the
 *  router.refresh() that drives server-component revalidation. */
export const FLEETCROWN_REFRESH_EVENT = "fleetcrown:refresh";

/** Fired (with `detail: { prompt }`) to open the floating assistant panel
 *  prefilled. Producer: LokiDispatchButton. Listener: AskLokiButton. */
export const LOKI_OPEN_EVENT = "loki:open";

/** Fired (with `detail: { prompt }`) to prefill the Loki workspace composer.
 *  Listener: LokiWorkspace. */
export const LOKI_PREFILL_EVENT = "loki:prefill";
