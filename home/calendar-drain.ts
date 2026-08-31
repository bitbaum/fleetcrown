#!/usr/bin/env -S npx tsx
/**
 * Calendar drain — the local half of calendar booking.
 *
 * Calendar events are booked through the locally-authenticated `gog` CLI, which
 * only exists on the operator's machine. Approvals, however, usually happen on
 * the cloud control plane (phone/browser) where `gog` isn't present — so those
 * approved events sit in the `actions` queue at status='approved', unbooked.
 *
 * This process closes that gap. It runs on the local machine and:
 *   1. GET  /api/actions/drain-events  → approved-but-unbooked calendar events
 *   2. for each, book it locally via `gog calendar create` (bookCalendarEvent)
 *   3. POST /api/actions/drain-events  → report the outcome; cloud marks executed
 *
 * The `actions` table stays the single source of truth — nothing is copied into
 * a second queue. A booked row drops out of the GET list on the next pass, so
 * re-polling is safe and idempotent.
 *
 * Config (env):
 *   FLEETCROWN_API_URL     cloud app base URL   (default: the APP_URL constant)
 *   FLEETCROWN_AGENT_TOKEN ck_* token from /settings → Agent tokens (required)
 *   FLEETCROWN_DRAIN_INTERVAL_MS  poll cadence (default 15000)
 *
 * Run:    FLEETCROWN_AGENT_TOKEN=ck_… npx tsx home/calendar-drain.ts --start
 * Test:   npx tsx home/calendar-drain.ts --self-test   (pure logic, no I/O)
 */
import { APP_URL } from "@/config/brand";
import {
  bookCalendarEvent,
  resolveEventTimes,
  buildGogCreateArgs,
} from "@/lib/actions/calendar-event";
import type { ActionPayload } from "@/db/schema/actions";

type DrainEvent = { id: string; title: string; payload: ActionPayload | null };

/**
 * Where to reach the cloud drain endpoint and how to auth. Standalone CLI use
 * fills these from env; the embedded desktop runner passes them explicitly from
 * its own token store + base-URL resolution so we don't duplicate the protocol.
 */
export type DrainConfig = { baseUrl?: string; token?: string };

function baseUrl(cfg?: DrainConfig): string {
  return (cfg?.baseUrl ?? process.env.FLEETCROWN_API_URL ?? APP_URL).replace(/\/$/, "");
}

function authHeader(cfg?: DrainConfig): Record<string, string> {
  const token = (cfg?.token ?? process.env.FLEETCROWN_AGENT_TOKEN)?.trim();
  if (!token)
    throw new Error(
      "FLEETCROWN_AGENT_TOKEN is required (mint a ck_* token at /settings → Agent tokens)",
    );
  return { authorization: `Bearer ${token}` };
}

/** One drain pass: fetch approved events, book each, report back. Returns count booked. */
export async function drainOnce(cfg?: DrainConfig): Promise<{ booked: number; failed: number }> {
  const base = baseUrl(cfg);
  const auth = authHeader(cfg);
  const res = await fetch(`${base}/api/actions/drain-events`, { headers: auth });
  if (!res.ok) throw new Error(`drain GET failed: ${res.status} ${res.statusText}`);
  const { events } = (await res.json()) as { events: DrainEvent[] };

  let booked = 0;
  let failed = 0;
  for (const ev of events ?? []) {
    const result = await bookCalendarEvent(ev.payload, ev.title);
    const body = result.ok
      ? { id: ev.id, ok: true as const, eventId: result.eventId, htmlLink: result.htmlLink }
      : { id: ev.id, ok: false as const, error: result.error };
    await fetch(`${base}/api/actions/drain-events`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (result.ok) {
      booked++;
      console.log(
        `[calendar-drain] booked "${ev.title}"${result.htmlLink ? ` → ${result.htmlLink}` : ""}`,
      );
    } else {
      failed++;
      console.error(`[calendar-drain] failed "${ev.title}": ${result.error}`);
    }
  }
  return { booked, failed };
}

async function start(): Promise<void> {
  const interval = Number(process.env.FLEETCROWN_DRAIN_INTERVAL_MS ?? 15000);
  authHeader(); // fail fast if token missing
  console.log(`[calendar-drain] polling ${baseUrl()}/api/actions/drain-events every ${interval}ms`);
  for (;;) {
    try {
      await drainOnce();
    } catch (e) {
      console.error(`[calendar-drain] pass errored:`, e instanceof Error ? e.message : e);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

// ── Inline self-test (pure time/arg resolution — the bug-prone part) ──────────
// Run with: npx tsx home/calendar-drain.ts --self-test
function selfTest(): void {
  let pass = 0;
  const cases: Array<[string, boolean]> = [];
  const check = (name: string, cond: boolean) => {
    cases.push([name, cond]);
    if (cond) pass++;
  };

  // All-day from a bare date → date-only from/to, end exclusive (next day).
  const allDay = resolveEventTimes({ eventDate: "2026-07-14" });
  check("bare date ⇒ all-day", allDay?.allDay === true);
  check("all-day from = the day", allDay?.from === "2026-07-14");
  check("all-day end is exclusive next day", allDay?.to === "2026-07-15");

  // Explicit start+end → precise instants, not all-day.
  const timed = resolveEventTimes({
    eventStart: "2026-07-14T09:00:00+02:00",
    eventEnd: "2026-07-14T17:00:00+02:00",
  });
  check("start+end ⇒ timed", timed?.allDay === false);
  check("timed from preserved as instant", timed?.from === "2026-07-14T07:00:00.000Z");
  check("timed to preserved as instant", timed?.to === "2026-07-14T15:00:00.000Z");

  // Start with no end → default 1-hour block.
  const oneHour = resolveEventTimes({ eventStart: "2026-07-14T09:00:00Z" });
  check("start-only ⇒ +1h end", oneHour?.to === "2026-07-14T10:00:00.000Z");

  // End before start is ignored → falls back to +1h.
  const badEnd = resolveEventTimes({
    eventStart: "2026-07-14T09:00:00Z",
    eventEnd: "2026-07-14T08:00:00Z",
  });
  check("end<start ignored ⇒ +1h", badEnd?.to === "2026-07-14T10:00:00.000Z");

  // Forced all-day even with a datetime.
  const forced = resolveEventTimes({ eventStart: "2026-07-14T09:00:00Z", allDay: true });
  check("allDay flag forces all-day", forced?.allDay === true && forced?.from === "2026-07-14");

  // No usable time → null (caller must not book).
  check("no date/time ⇒ null", resolveEventTimes({ eventTitle: "x" }) === null);

  // Arg builder: summary/from/to present; --all-day + --location appended correctly.
  const args = buildGogCreateArgs(
    { eventTitle: "revampit storage", eventDate: "2026-07-14", eventLocation: "Zurich" },
    "fallback",
  );
  check(
    "args start with calendar create primary",
    args?.slice(0, 3).join(" ") === "calendar create primary",
  );
  check("args carry --summary", args?.[args.indexOf("--summary") + 1] === "revampit storage");
  check("args carry --all-day", args?.includes("--all-day") === true);
  check("args carry --location", args?.[args.indexOf("--location") + 1] === "Zurich");

  // Falls back to action title when payload has no eventTitle.
  const argsFb = buildGogCreateArgs({ eventDate: "2026-07-14" }, "Team sync");
  check(
    "title falls back to action title",
    argsFb?.[argsFb.indexOf("--summary") + 1] === "Team sync",
  );

  // Unbookable payload → null args.
  check("no time ⇒ null args", buildGogCreateArgs({ eventTitle: "x" }, "") === null);

  for (const [name, ok] of cases) console.log(`${ok ? "✓" : "✗"} ${name}`);
  const total = cases.length;
  if (pass !== total) {
    console.error(`\n${pass}/${total} passed`);
    process.exit(1);
  }
  console.log(`\n${pass}/${total} passed`);
}

const isDirectCli = process.argv[1]?.endsWith("calendar-drain.ts");
if (isDirectCli) {
  if (process.argv.includes("--self-test")) {
    selfTest();
  } else if (process.argv.includes("--start")) {
    void start();
  } else {
    console.log(`calendar-drain — book cloud-approved calendar events on the local machine.

  npx tsx home/calendar-drain.ts --start        run the poll loop (needs gog + FLEETCROWN_AGENT_TOKEN)
  npx tsx home/calendar-drain.ts --self-test    run inline tests, no I/O`);
  }
}
