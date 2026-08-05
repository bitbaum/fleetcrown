/**
 * Hetzner capacity-watch config — WHERE the data comes from, not what it says.
 *
 * The box cannot be rescaled on demand: Falkenstein is capacity-blocked for the
 * cx line, so a bigger server type is only bookable during brief windows when
 * Hetzner marks it `available_for_migration`. /opt/monitoring/hcloud-availability.sh
 * polls that every 10 min, alerts on Telegram, and writes the JSON state file
 * below. This config points at it; every number shown in the UI comes from the
 * Hetzner API via that file, never from a constant here — hardware specs written
 * by hand go stale silently.
 */

/**
 * Written by scripts/hetzner/hcloud-availability.sh on every poll.
 * Overridable so a dev machine can point at a fixture — the box always uses the
 * default, and an unset override degrades to the honest "not tracked here".
 */
export const HETZNER_STATE_FILE =
  process.env.HETZNER_STATE_FILE?.trim() || "/opt/monitoring/state/hcloud_rescale.json";

/**
 * Third-party availability history for the upgrade target (server type 116 =
 * cx43). Operator-supplied reference view — we deliberately do not reinterpret
 * its query params, since its `loc` numbering is not documented and does not
 * necessarily match Hetzner's own location ids (where fsn1=1, nbg1=2).
 */
export const HETZNER_RADAR_URL =
  "https://radar.iodev.org/cloud-status?hist=st%3A116%2Cloc%3A2";

/** Where the rescale is actually performed once a window opens. */
export const HETZNER_CONSOLE_URL = "https://console.hetzner.cloud/";

/** Steps to take the moment a window opens — windows can close in minutes. */
export const HETZNER_RESCALE_STEPS =
  "Console → bitbaum → Rescale → pick the type → keep disk → power-cycle";
