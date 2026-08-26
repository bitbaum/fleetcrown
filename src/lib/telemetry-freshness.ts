/**
 * Is each telemetry path still carrying traffic?
 *
 * SSOT for the answer, shared by the cron (`api/crons/check-telemetry`), Fleet
 * Doctor and `npm run check:telemetry`, so the three cannot drift into
 * disagreeing about what "healthy" means.
 *
 * ── Four states, never collapsed into two ────────────────────────────────────
 *   FLOWING   — a row arrived inside the budget.
 *   STALE     — rows exist, but the newest is older than the budget. This is a
 *               REGRESSION: the path demonstrably worked and then stopped.
 *   SILENT    — the table has never held a row. Different fault, different fix:
 *               nothing was ever wired, so there is no regression to find.
 *   UNCHECKED — the query failed. NOT a pass and NOT a fault; we did not look.
 *
 * The last one is the one that matters most. Collapsing "could not look" into
 * "fine" is how a monitor becomes a thing that emits ✓ without checking.
 *
 * ── Why the DATABASE computes the age ────────────────────────────────────────
 * Age is `now() - max(ts)` evaluated in Postgres, not `Date.now()` minus a
 * timestamp shipped to Node. An elapsed time measured across two clocks is a
 * measurement of the clock skew as much as of the thing — and this check runs
 * from the box (cron), a laptop (Doctor) and CI, which do not share a clock.
 */

import { TELEMETRY_PATHS, type TelemetryPath } from "@/config/telemetry-paths";

export type PathState =
  /** Monitored, and a row arrived inside its budget. */
  | "flowing"
  /** Monitored: rows exist, newest is past the budget. A regression. */
  | "stale"
  /** No rows, ever. */
  | "silent"
  /** The read failed. Not a pass, not a fault. */
  | "unchecked"
  /**
   * Not monitored, and has rows. Deliberately NOT "flowing": `beacon_sessions`
   * last saw a row 78 days ago and calling that "flowing" would be the same
   * species of lie this module exists to catch — a healthy-looking word for
   * something nobody actually checked.
   */
  | "ondemand";

/** What a reader reports for one path. `null` means the read itself failed. */
export type PathReading = {
  rows: number;
  /** ISO timestamp of the newest row, or null when there are none. */
  newest: string | null;
  /** Hours since the newest row, computed by the DATABASE. Null when no rows. */
  ageHours: number | null;
};

export type FreshnessReader = (path: TelemetryPath) => Promise<PathReading | null>;

export type PathResult = {
  table: string;
  label: string;
  writer: string;
  state: PathState;
  /** Whether silence here is a fault. Carried on the RESULT rather than looked
   *  up in the config, so the report describes the paths actually checked. */
  monitored: boolean;
  rows: number;
  newest: string | null;
  ageHours: number | null;
  /** Budget in hours — only present for monitored paths. */
  maxSilenceHours: number | null;
  /** Why the read failed, when state is "unchecked". */
  error?: string;
};

export type TelemetryReport = {
  results: PathResult[];
  /** Monitored paths that have gone quiet — the actionable set. */
  broken: PathResult[];
  /** Monitored paths we could not read. Never counted as healthy. */
  unchecked: PathResult[];
  /**
   * MONITORED paths carrying traffic. Counting the on-demand ones here would
   * let a summary say "all 12 paths healthy" while one of them had been quiet
   * for 78 days — a true-sounding sentence assembled from an irrelevant tally.
   */
  flowingCount: number;
  /** Monitored paths in total, so `flowingCount` has a denominator. */
  monitoredCount: number;
};

/**
 * The production reader. Imported LAZILY by callers that have a database —
 * `@/db` throws at module init when DATABASE_URL is unset, and a static import
 * would make this whole file unloadable in the env-independent test tier, which
 * is precisely where the state machine above most needs testing.
 */
export async function dbReader(path: TelemetryPath): Promise<PathReading | null> {
  try {
    const { db } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    // The table/column names come from a hand-written config in this repo, not
    // from user input, and are asserted against the Drizzle schema by
    // scripts/test/telemetry-freshness.ts — so an identifier that reaches here
    // is one this codebase declared. They are still quoted as identifiers
    // rather than interpolated raw.
    const rows = (await db.execute(
      sql`select count(*)::int as rows,
                 max(${sql.identifier(path.timeColumn)}) as newest,
                 extract(epoch from (now() - max(${sql.identifier(path.timeColumn)})))/3600.0 as age_hours
          from ${sql.identifier(path.table)}`,
    )) as unknown as Array<{ rows: number; newest: string | Date | null; age_hours: string | number | null }>;

    const r = rows[0];
    if (!r) return null;
    const newest = r.newest instanceof Date ? r.newest.toISOString() : (r.newest ?? null);
    return {
      rows: Number(r.rows ?? 0),
      newest,
      ageHours: r.age_hours == null ? null : Number(r.age_hours),
    };
  } catch {
    return null;
  }
}

function classify(path: TelemetryPath, reading: PathReading | null): PathState {
  if (reading === null) return "unchecked";
  if (reading.rows === 0 || reading.ageHours === null) return "silent";
  if (!path.monitored) return "ondemand";
  return reading.ageHours > path.maxSilenceHours ? "stale" : "flowing";
}

/**
 * Read every path (or just the monitored ones) and classify each.
 *
 * Reads run in parallel: a serial loop would make the whole check as slow as
 * the sum of its queries, and this runs inside a cron that also has to finish.
 */
export async function checkTelemetryFreshness(
  read: FreshnessReader = dbReader,
  paths: TelemetryPath[] = TELEMETRY_PATHS,
): Promise<TelemetryReport> {
  const results = await Promise.all(
    paths.map(async (path): Promise<PathResult> => {
      let reading: PathReading | null = null;
      let error: string | undefined;
      try {
        reading = await read(path);
        if (reading === null) error = "read returned no result";
      } catch (err) {
        reading = null;
        error = err instanceof Error ? err.message : String(err);
      }
      const state = classify(path, reading);
      return {
        table: path.table,
        label: path.label,
        writer: path.writer,
        state,
        monitored: path.monitored,
        rows: reading?.rows ?? 0,
        newest: reading?.newest ?? null,
        ageHours: reading?.ageHours ?? null,
        maxSilenceHours: path.monitored ? path.maxSilenceHours : null,
        ...(state === "unchecked" ? { error: error ?? "unknown read failure" } : {}),
      };
    }),
  );

  return {
    results,
    // A monitored path that is SILENT is broken too — it was declared as
    // something that should be carrying traffic and it never has.
    broken: results.filter((r) => r.monitored && (r.state === "stale" || r.state === "silent")),
    unchecked: results.filter((r) => r.monitored && r.state === "unchecked"),
    flowingCount: results.filter((r) => r.monitored && r.state === "flowing").length,
    monitoredCount: results.filter((r) => r.monitored).length,
  };
}

/** Round to something a human reads without decoding. */
export function humanizeAge(ageHours: number | null): string {
  if (ageHours === null) return "never";
  if (ageHours < 1) return `${Math.round(ageHours * 60)}m`;
  if (ageHours < 48) return `${ageHours.toFixed(1)}h`;
  return `${Math.round(ageHours / 24)}d`;
}

/** The alert body: what stopped, how long ago, and who to suspect. */
export function describeBroken(report: TelemetryReport): string {
  return report.broken
    .map((r) =>
      r.state === "silent"
        ? `• ${r.label} (${r.table}) — NEVER carried a row. Written by: ${r.writer}`
        : `• ${r.label} (${r.table}) — last row ${humanizeAge(r.ageHours)} ago ` +
          `(budget ${r.maxSilenceHours}h). Written by: ${r.writer}`,
    )
    .join("\n");
}
