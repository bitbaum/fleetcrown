/**
 * SSOT for Postgres connection URLs — self-hosted, vendor-neutral.
 *
 * The self-hosted Postgres on Hetzner (and any other plain Postgres / PgBouncer)
 * uses the same two env vars:
 *
 *   DATABASE_URL       — direct session (migrations, LISTEN/NOTIFY, drizzle-kit)
 *   DATABASE_POOL_URL  — pooled session for app queries
 *
 * Local dev: set DATABASE_URL only (pool URL falls back to the same value).
 */

function trimEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

/** Pooled URL for runtime queries. Falls back to the direct URL when no
 *  separate pool is configured (local dev, single-Postgres deploys). */
export function getDatabasePoolUrl(): string {
  const url = trimEnv(process.env.DATABASE_POOL_URL) ?? trimEnv(process.env.DATABASE_URL);
  if (!url) {
    throw new Error("DATABASE_POOL_URL or DATABASE_URL is required");
  }
  return url;
}

/**
 * Direct URL for DDL, LISTEN/NOTIFY, and migrations.
 * Never falls back to a pool URL — poolers break those features.
 */
export function getDatabaseDirectUrl(): string | undefined {
  return trimEnv(process.env.DATABASE_URL);
}
