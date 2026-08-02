/**
 * Promote policy — which FleetCrown moments reach OrangeCat's publish bus.
 *
 * OrangeCat's `timeline_events` is a curated PUBLIC projection, not a mirror of
 * FleetCrown's private event spine. This config is the single place that decides
 * what is publish-worthy and how it maps onto OrangeCat's allowed event types
 * (a fixed subset enforced by OC's inbound contract — see the OC repo,
 * src/config/external-publish.ts). Never publish from a call site directly;
 * route through src/lib/integrations/orangecat-publish.ts, which consults this.
 */

import { APP_URL } from "./brand";

/** OC-side event types the bus accepts (ceiling defined on the OC side). */
export type OrangeCatPublishEventType =
  | "project_updated"
  | "project_milestone"
  | "project_completed"
  | "project_goal_reached"
  | "project_published";

/** FleetCrown moments that MAY be promoted, and how they map onto OC's taxonomy. */
export const PROMOTE_POLICY = {
  /** A dev-log entry was appended (agent or human changelog note). */
  devlog_entry: { enabled: true, eventType: "project_updated" as OrangeCatPublishEventType },
  /** The project was first published to OrangeCat. */
  project_published: { enabled: true, eventType: "project_published" as OrangeCatPublishEventType },
  /** An orchestration run closed successfully (the run→wall loop). Success-only
   *  by design: failed/reaped runs stay FleetCrown-private — the wall is a
   *  curated projection, not a mirror of the event spine. */
  run_closed: { enabled: true, eventType: "project_updated" as OrangeCatPublishEventType },
} as const;

export type PromotableMoment = keyof typeof PROMOTE_POLICY;

/** Public FleetCrown URL used for deep-links back from the OrangeCat wall. */
export const FLEETCROWN_PUBLIC_ORIGIN = APP_URL;
