import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Use direct (non-pooled) URL for migrations — pooler doesn't support DDL
    url: process.env.NEON_DATABASE_URL_DIRECT ?? process.env.DATABASE_URL!,
  },
});
