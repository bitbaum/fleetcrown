import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import type { ActivityPulse as Pulse } from "@/lib/activity-summary";
import type { DigestWindow } from "@/db/queries/digests";
import { formatPulseBucketLabel } from "./activity-shared";

/**
 * When the fleet worked, and where it went wrong.
 *
 * ── Why outcome is NOT a colour here ──────────────────────────────────────
 * The obvious design is a stacked bar per time slice, green for done and red
 * for failed. It is unreadable. Measured against this app's own status tokens
 * on the dark surface it ships by default, `--status-positive` and
 * `--status-negative` are ΔE 3.1 apart under deuteranopia — for a red-green
 * colourblind operator those bars are the same colour, and the one thing the
 * chart exists to show disappears.
 *
 * So volume is one hue (height carries magnitude — the safe encoding), and a
 * failure is marked by SHAPE: a tick below the axis, in the status colour, with
 * a legend that names it in words. Colour is then a reinforcement of position
 * and text rather than the sole carrier of meaning.
 *
 * ── Why no tooltip-only values ────────────────────────────────────────────
 * A tooltip is not a way to read data on a phone, where there is no hover.
 * Every bar carries a `title` for pointer users, but the facts the chart is
 * making — peak, total, when the failures were — are also stated in the caption
 * underneath, in text.
 */
export function ActivityPulse({
  pulse,
  digestWindow,
}: {
  pulse: Pulse;
  digestWindow: DigestWindow;
}) {
  if (pulse.buckets.length === 0 || pulse.peak === 0) return null;

  const total = pulse.buckets.reduce((n, b) => n + b.total, 0);
  const attentionBuckets = pulse.buckets.filter((b) => b.attention > 0);
  const busiest = pulse.buckets.reduce((best, b) => (b.total > best.total ? b : best), pulse.buckets[0]);

  return (
    <figure className="ui-pulse">
      <div className="ui-pulse-plot" role="img"
        aria-label={`Activity over ${pulse.buckets.length} time slices. ${total} actions, busiest slice ${busiest.total}. ${attentionBuckets.length} slices contain something needing attention.`}
      >
        {pulse.buckets.map((bucket) => {
          // Floor of 6% so a slice with real work is never invisible next to a
          // busy one — a bar you cannot see reads as "nothing happened here".
          const heightPct = bucket.total === 0 ? 0 : Math.max(6, (bucket.total / pulse.peak) * 100);
          const label = formatPulseBucketLabel(bucket.startsAt, digestWindow);
          return (
            <div
              key={bucket.startsAt}
              className="ui-pulse-slot"
              title={
                bucket.total === 0
                  ? `${label}: nothing`
                  : `${label}: ${bucket.total} action${bucket.total === 1 ? "" : "s"}${
                      bucket.attention > 0 ? `, ${bucket.attention} needing attention` : ""
                    }`
              }
            >
              <div className="ui-pulse-track">
                {bucket.total > 0 && (
                  <div className="ui-pulse-bar" style={{ height: `${heightPct}%` }} />
                )}
              </div>
              {/* Shape, not hue, is what marks a failure — see the note above. */}
              <span
                className={cn("ui-pulse-tick", bucket.attention > 0 && "ui-pulse-tick-alert")}
                aria-hidden
              />
            </div>
          );
        })}
      </div>

      <figcaption className="ui-pulse-caption">
        <span className="ui-pulse-legend">
          <span className="ui-pulse-legend-bar" aria-hidden />
          actions per {bucketUnitLabel(digestWindow)}
        </span>
        {attentionBuckets.length > 0 && (
          <span className="ui-pulse-legend ui-pulse-legend-alert">
            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
            {attentionBuckets.length === 1
              ? "1 slice needs you"
              : `${attentionBuckets.length} slices need you`}
          </span>
        )}
        <span className="ui-pulse-peak">
          busiest: {busiest.total} at {formatPulseBucketLabel(busiest.startsAt, digestWindow)}
        </span>
      </figcaption>
    </figure>
  );
}

function bucketUnitLabel(digestWindow: DigestWindow): string {
  if (digestWindow === "hour") return "5 min";
  if (digestWindow === "day") return "hour";
  return "day";
}
