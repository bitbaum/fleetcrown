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
