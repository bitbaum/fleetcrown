import postgres from "postgres";

// Installs a Postgres NOTIFY trigger on project_states (idempotent — safe to run on every boot).
// Must use DATABASE_URL (direct connection) — Neon pooler doesn't support DDL + NOTIFY.
export async function setupNotifyTrigger(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const sql = postgres(url, { max: 1 });
  try {
    // Dollar-quoted PL/pgSQL — use .unsafe() to bypass tagged-template parsing.
    await sql.unsafe(`
      CREATE OR REPLACE FUNCTION cockpit_notify_project_state()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_notify('cockpit_state', NEW.user_id::text);
        RETURN NEW;
      END;
      $$;
    `);
    await sql.unsafe(`DROP TRIGGER IF EXISTS project_states_notify ON project_states;`);
    await sql.unsafe(`
      CREATE TRIGGER project_states_notify
        AFTER INSERT OR UPDATE ON project_states
        FOR EACH ROW EXECUTE FUNCTION cockpit_notify_project_state();
    `);
    console.log("[instrumentation] Postgres NOTIFY trigger installed on project_states");
  } finally {
    await sql.end();
  }
}
