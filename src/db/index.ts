import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabasePoolUrl } from "@/lib/db-url";
import * as schema from "./schema";

const DATABASE_URL = getDatabasePoolUrl();

/**
 * Hot-reload-safe singleton client.
 *
 * Next.js dev re-evaluates server modules on every change, and `postgres()`
 * defaults to a 10-connection pool per client instance — the pools stack
 * up and eventually exhaust Postgres' connection slots, manifesting as
 * "remaining connection slots are reserved for roles with the SUPERUSER
 * attribute" on whichever route happens to need a connection next (in
 * practice: /api/people/[id], which issues 5 parallel queries).
 *
 * Memoizing on globalThis ensures one client survives module reloads,
 * and `max: 5` keeps the pool footprint small enough that any real
 * connection leak would surface quickly rather than after a day of dev.
 */
const globalForDb = globalThis as unknown as { __cockpitPg?: ReturnType<typeof postgres> };
const client = globalForDb.__cockpitPg ?? postgres(DATABASE_URL, { max: 5 });
if (process.env.NODE_ENV !== "production") globalForDb.__cockpitPg = client;

export const db = drizzle(client, { schema });
