/**
 * Human-facing rendering of the telemetry freshness check.
 * Run: npm run check:telemetry   (needs DATABASE_URL — see .env.local)
 *
 * The cron at api/crons/check-telemetry answers the same question on a timer;
 * this exists so a person can ask it now, and so the answer is reviewable
 * during a change. Both call checkTelemetryFreshness(), so they cannot drift.
 */
import { existsSync, readFileSync } from "node:fs";

function loadEnvFile(file: string) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = line
      .slice(idx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — cannot look. (Not the same as 'all clear'.)");
    process.exit(2);
  }

  const { checkTelemetryFreshness, humanizeAge } = await import("../src/lib/telemetry-freshness");
  const report = await checkTelemetryFreshness();

  const icon = { flowing: "✓", stale: "✗", silent: "○", unchecked: "?", ondemand: "·" } as const;
  for (const r of report.results) {
    const budget = r.maxSilenceHours ? `budget ${r.maxSilenceHours}h` : "on demand";
    const age = r.ageHours === null ? "never" : `${humanizeAge(r.ageHours)} ago`;
    console.log(
      `${icon[r.state]} ${r.table.padEnd(22)} ${r.state.padEnd(9)} ` +
        `${age.padStart(10)}  ${String(r.rows).padStart(7)} rows  (${budget})`,
    );
  }

  console.log("");
  if (report.broken.length > 0) {
    console.error(`✗ ${report.broken.length} monitored path(s) stopped recording:`);
    for (const r of report.broken) console.error(`    ${r.table} — written by ${r.writer}`);
  }
  if (report.unchecked.length > 0) {
    console.error(`? ${report.unchecked.length} monitored path(s) UNCHECKED — not a pass`);
  }
  if (report.broken.length === 0 && report.unchecked.length === 0) {
    console.log(
      `✓ all ${report.monitoredCount} MONITORED path(s) carrying traffic ` +
        `(${report.results.length - report.monitoredCount} on-demand path(s) not judged)`,
    );
  }

  // Exit non-zero on a real fault OR on an unreadable one: "I could not look"
  // must never be reported with the same exit code as "everything is fine".
  process.exit(report.broken.length > 0 || report.unchecked.length > 0 ? 1 : 0);
}

void main();
