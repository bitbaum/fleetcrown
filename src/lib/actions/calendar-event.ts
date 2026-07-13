/**
 * Calendar-event booking — the real effect behind an approved CREATE_EVENT action.
 *
 * SSOT for turning a Loki-proposed event payload into a Google Calendar event via
 * the locally-authenticated `gog` CLI (the same tool the /today calendar card
 * reads from). No googleapis/OAuth stack — we reuse gog's existing token bucket.
 *
 * Security: every user-derived field (title, location, times) is passed to gog as
 * an argv element through `runToolArgs` (execFile, no shell), never interpolated
 * into a shell string. See lib/tools.ts.
 */
import type { ActionPayload } from "@/db/schema/actions";
import { runToolArgs } from "@/lib/tools";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_CALENDAR = "primary";

export type ResolvedEventTimes = {
  /** RFC3339 instant, or YYYY-MM-DD when allDay. */
  from: string;
  to: string;
  allDay: boolean;
};

/**
 * Derive concrete start/end from whatever Loki filled in. Precedence:
 *   1. eventStart (+ eventEnd, else +1h)         — precise, preferred
 *   2. eventDate  — date-only ⇒ all-day (1 day); datetime ⇒ +1h block
 * Returns null when there is no usable time at all (caller must not book).
 */
export function resolveEventTimes(payload: ActionPayload | null | undefined): ResolvedEventTimes | null {
  const forceAllDay = payload?.allDay === true;
  const start = typeof payload?.eventStart === "string" ? payload.eventStart.trim() : "";
  const end = typeof payload?.eventEnd === "string" ? payload.eventEnd.trim() : "";
  const date = typeof payload?.eventDate === "string" ? payload.eventDate.trim() : "";

  const source = start || date;
  if (!source) return null;

  // All-day: either forced, or the only signal is a bare calendar day.
  if (forceAllDay || (!start && DATE_ONLY.test(date))) {
    const day = (start || date).slice(0, 10);
    const t = Date.parse(`${day}T00:00:00Z`);
    if (Number.isNaN(t)) return null;
    // Google treats an all-day `end` as exclusive → next day for a single-day event.
    const endDay = end && DATE_ONLY.test(end) ? end : new Date(t + DAY_MS).toISOString().slice(0, 10);
    return { from: day, to: endDay, allDay: true };
  }

  const fromMs = Date.parse(source);
  if (Number.isNaN(fromMs)) return null;
  const endMs = end ? Date.parse(end) : NaN;
  const toMs = !Number.isNaN(endMs) && endMs > fromMs ? endMs : fromMs + HOUR_MS;
  return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), allDay: false };
}

/**
 * Build the `gog calendar create` argv for an event. Pure (no I/O) so it can be
 * asserted directly in tests. Returns null when the payload can't be booked
 * (no title or no usable time).
 */
export function buildGogCreateArgs(
  payload: ActionPayload | null | undefined,
  fallbackTitle: string,
  calendarId: string = DEFAULT_CALENDAR,
): string[] | null {
  const title = (typeof payload?.eventTitle === "string" && payload.eventTitle.trim()) || fallbackTitle.trim();
  if (!title) return null;
  const times = resolveEventTimes(payload);
  if (!times) return null;

  const args = ["calendar", "create", calendarId, "--json", "--summary", title, "--from", times.from, "--to", times.to];
  if (times.allDay) args.push("--all-day");
  const location = typeof payload?.eventLocation === "string" ? payload.eventLocation.trim() : "";
  if (location) args.push("--location", location);
  return args;
}

export type BookEventResult =
  | { ok: true; eventId?: string; htmlLink?: string }
  | { ok: false; error: string };

/**
 * Book the event by running gog. Assumes the caller already checked the local
 * runtime is available (gog only exists there). Reversible: a wrong booking can
 * be deleted from the calendar — but we still only run behind the approval gate.
 */
export async function bookCalendarEvent(
  payload: ActionPayload | null | undefined,
  fallbackTitle: string,
): Promise<BookEventResult> {
  const args = buildGogCreateArgs(payload, fallbackTitle);
  if (!args) return { ok: false, error: "missing title or date/time in event payload" };

  const res = await runToolArgs("gog", args, 20000);
  if (!res.ok) return { ok: false, error: res.error ?? "gog calendar create failed" };

  // gog --json returns the created event; surface id/link for the audit trail.
  try {
    const parsed = JSON.parse(res.data ?? "{}");
    const event = parsed?.event ?? parsed?.result ?? parsed;
    return { ok: true, eventId: event?.id, htmlLink: event?.htmlLink };
  } catch {
    // A non-JSON success (older gog) is still a success — the exit code was 0.
    return { ok: true };
  }
}
