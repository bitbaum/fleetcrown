// Next.js server startup hook — runs once per process on boot.
// Installs the Postgres NOTIFY trigger and starts the /tmp file watcher (local only).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { setupNotifyTrigger } = await import("@/db/setup-notify-trigger");
  await setupNotifyTrigger().catch((e) => console.warn("[instrumentation] trigger setup failed:", e));

  if (process.env.RUNTIME_AVAILABLE === "true") {
    const { startSentinelWatcher } = await import("@/lib/sentinel-watcher");
    startSentinelWatcher();
  }
}

// Server-side error capture (Next.js 15+). Mirrors the client-side error
// boundary telemetry — but with the FULL error.message + stack that prod
// builds strip from the client. Lands the row in debug_logs keyed by the
// same digest the client logs, so server + client records correlate. The
// vercel logs CLI is unreliable from our local env (see memory:
// pattern_vercel_log_fallback); this is the durable substitute.
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath: string; routeType: string },
): Promise<void> {
  try {
    const e = error as { message?: string; stack?: string; digest?: string };
    const { logDebug } = await import("@/db/queries/debug-logs");
    await logDebug({
      source: "instrumentation/onRequestError",
      level: "error",
      message: (e?.message ?? "unknown server error").slice(0, 500),
      meta: {
        digest: e?.digest ?? null,
        path: request.path,
        routePath: context.routePath,
        routeType: context.routeType,
        stack: (e?.stack ?? "").split("\n").slice(0, 12).join("\n"),
      },
    });
  } catch {
    // Never throw out of an error reporter — would mask the original error.
  }
}
