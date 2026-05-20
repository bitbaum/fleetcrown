/**
 * Tiny wrapper around the Vibration API for primary-action tactile feedback.
 *
 * Browser support is uneven: Chrome Android fires, iOS Safari is a no-op
 * (Apple removed the API in 2017 — Safari accepts the call but does nothing).
 * Desktops typically ignore it. So this is purely additive — no fallback,
 * no UI surface, no error path. If support is absent or the user has disabled
 * vibration, the call silently does nothing.
 *
 * Default 10ms = "tick" duration; matches iOS UISelectionFeedback / Material
 * "soft" feel — short enough that the user perceives it as confirmation,
 * not a buzz.
 */
export function haptic(durationMs: number = 10): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(durationMs);
  } catch {
    // Some browsers throw on programmatic vibrate without a user gesture; ignore.
  }
}
