import { defineConfig } from "drizzle-kit";
import { getDatabaseDirectUrl } from "./src/lib/db-url";

const url = getDatabaseDirectUrl();
if (!url) {
  throw new Error("DATABASE_URL is required for drizzle-kit (direct connection, not pool URL)");
}

export default defineConfig({
  schema: "./src/db/schema",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Direct URL only — poolers (Neon, PgBouncer) do not support DDL reliably.
    url,
  },
});
