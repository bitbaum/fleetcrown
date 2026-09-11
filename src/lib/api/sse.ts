/**
 * Server-sent events for a ONE-SHOT job: a request that runs a single piece of
 * work, reports progress while it runs, and closes when the work is done.
 *
 * That is a different lifecycle from the long-lived subscriptions in
 * `/api/control/stream`, `/api/control/peek-stream` and
 * `/api/workspaces/[id]/stream`, which stay open indefinitely and need
 * keepalives, listener teardown and fallback ticks. They are deliberately NOT
 * folded in here: a job that ends has nothing to keep alive, and a subscription
 * that ends is a bug. Only the header block is genuinely common, and it is
 * small enough that unifying the two lifecycles would cost more than it saves.
 */

/** The headers that make a stream actually stream. */
const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  // `no-transform` is the load-bearing half: a proxy that helpfully gzips or
  // rewrites the body buffers it, and the client then gets the whole turn in
  // one lump at the end — the exact behaviour the stream exists to remove.
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
  Connection: "keep-alive",
} as const;

/**
 * Run `job`, streaming whatever it emits, and close.
 *
 * `emit` is safe to call after the client has gone: writing to a closed
 * controller throws, and a turn aborted by the operator pressing Stop would
 * otherwise die with an unhandled rejection rather than simply stopping.
 */
export function sseResponse<E>(
  encode: (event: E) => string,
  job: (emit: (event: E) => void, signal: AbortSignal) => Promise<void>,
  clientSignal?: AbortSignal,
  /**
   * Turn a thrown error into a final event.
   *
   * Without it a job that throws closes a 200 stream having said nothing, and
   * the client cannot tell that from a turn that legitimately produced no
   * answer. Silence is not a status.
   */
  onError?: (error: unknown) => E,
): Response {
  const encoder = new TextEncoder();
  // Closing over an abort controller rather than the request's own signal lets
  // the stream's cancel() (the browser navigating away, or Stop) reach the job,
  // which is what actually stops the model calls.
  const abort = new AbortController();
  if (clientSignal) {
    if (clientSignal.aborted) abort.abort();
    else clientSignal.addEventListener("abort", () => abort.abort(), { once: true });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (event: E) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(encode(event)));
        } catch {
          // The client is gone. Stop trying to talk to it, and let the job's
          // own signal wind it down.
          open = false;
          abort.abort();
        }
      };
      try {
        await job(emit, abort.signal);
      } catch (e) {
        console.error("[sse] job failed", e);
        // Aborting is the operator pressing Stop, not a failure to report.
        if (onError && !abort.signal.aborted) emit(onError(e));
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          /* already closed by a cancelled client */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
