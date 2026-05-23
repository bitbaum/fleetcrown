import postgres from "postgres";
import { APP_SLUG } from "@/config/brand";
import { getDatabaseDirectUrl } from "@/lib/db-url";

// Postgres identifier (function + channel) names derived from APP_SLUG so a
// brand rename moves all three contract sites together: this file, the LISTEN
// in src/app/api/control/stream/route.ts, and the trigger itself in the DB.
// Slug is sanitized to ascii [a-z0-9_] for safe direct interpolation into SQL.
const _slug = APP_SLUG.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
export const NOTIFY_FN_NAME = `${_slug}_notify_project_state`;
export const NOTIFY_CHANNEL = `${_slug}_state`;

// Installs a Postgres NOTIFY trigger on project_states (idempotent — safe to run on every boot).
// Must use a direct connection — poolers (Neon, PgBouncer transaction mode) break DDL + NOTIFY.
export async function setupNotifyTrigger(): Promise<void> {
  const url = getDatabaseDirectUrl();
  if (!url) return;
  const sql = postgres(url, { max: 1 });
  try {
    // Dollar-quoted PL/pgSQL — use .unsafe() to bypass tagged-template parsing.
    // NOTIFY_FN_NAME / NOTIFY_CHANNEL are sanitized above; direct interpolation
    // is safe because APP_SLUG is a compile-time constant from brand.ts.
    await sql.unsafe(`
      CREATE OR REPLACE FUNCTION ${NOTIFY_FN_NAME}()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_notify('${NOTIFY_CHANNEL}', NEW.user_id::text);
        RETURN NEW;
      END;
      $$;
    `);
    await sql.unsafe(`DROP TRIGGER IF EXISTS project_states_notify ON project_states;`);
    await sql.unsafe(`
      CREATE TRIGGER project_states_notify
        AFTER INSERT OR UPDATE ON project_states
        FOR EACH ROW EXECUTE FUNCTION ${NOTIFY_FN_NAME}();
    `);
    console.log(`[instrumentation] Postgres NOTIFY trigger installed on project_states (fn=${NOTIFY_FN_NAME}, channel=${NOTIFY_CHANNEL})`);
  } finally {
    await sql.end();
  }
}
