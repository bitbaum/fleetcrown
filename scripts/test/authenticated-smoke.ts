/**
 * Authenticated smoke — exercises page + API routes with a real session.
 *
 * Session resolution (first match wins):
 *   1. FLEETCROWN_SESSION_TOKEN env (COCKPIT_SESSION_TOKEN legacy)
 *   2. SMOKE_EMAIL + SMOKE_PASSWORD → NextAuth credentials sign-in
 *   3. Latest non-expired row in `sessions` (JWT deployments usually empty)
 *   4. Brave browser profile (AUTH_MODE=browser, or auto on prod when 1–3 fail)
 *
 * Usage:
 *   npm run test:authenticated-smoke
 *   BASE=https://fleetcrown.orangecat.ch npm run test:authenticated-smoke
 *   SMOKE_EMAIL=you@example.com SMOKE_PASSWORD=… npm run test:authenticated-smoke
 *
 * Writes a JSON report to .tmp/authenticated-smoke-report.json (gitignored).
 */
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { config } from "dotenv";

import { smokeSessionToken } from "@/lib/brand-env";

config({ path: ".env.local" });
config({ path: ".env.hetzner.local" });

const BASE = (process.env.BASE ?? "http://localhost:3000").replace(/\/$/, "");
const ERROR_BOUNDARY = "Something went wrong";

type ProbeResult = {
  route: string;
  method: "GET" | "POST";
  status: number;
  ok: boolean;
  note?: string;
};

type Report = {
  base: string;
  ranAt: string;
  sessionSource: string;
  privateZoneLocked: boolean;
  passed: number;
  failed: number;
  probes: ProbeResult[];
};

function loadEnvFile(file: string) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

function sessionCookieName(): string {
  return BASE.startsWith("https://") ? "__Secure-authjs.session-token" : "authjs.session-token";
}

function parseSetCookie(header: string | null): string | undefined {
  if (!header) return undefined;
  const name = sessionCookieName();
  const match = header.match(new RegExp(`${name.replace(/\./g, "\\.")}=([^;]+)`));
  return match?.[1];
}

async function signInWithCredentials(email: string, password: string): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { signal: AbortSignal.timeout(15_000) });
  if (!csrfRes.ok) throw new Error(`CSRF fetch failed (${csrfRes.status})`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const body = new URLSearchParams({
    csrfToken,
    email,
    password,
    callbackUrl: `${BASE}/today`,
    json: "true",
  });

  const res = await fetch(`${BASE}/api/auth/callback/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });

  const token = parseSetCookie(res.headers.get("set-cookie"));
  if (token) return token;

  // Some Auth.js builds chain through a redirect that still sets the cookie.
  if (res.status === 302 || res.status === 303) {
    const loc = res.headers.get("location");
    if (loc) {
      const follow = await fetch(loc.startsWith("http") ? loc : `${BASE}${loc}`, {
        redirect: "manual",
        headers: { Cookie: res.headers.get("set-cookie") ?? "" },
        signal: AbortSignal.timeout(30_000),
      });
      const chained = parseSetCookie(follow.headers.get("set-cookie"));
      if (chained) return chained;
    }
  }

  const errText = await res.text().catch(() => "");
  throw new Error(`credentials sign-in failed (${res.status})${errText ? `: ${errText.slice(0, 80)}` : ""}`);
}

async function resolveSessionFromBrowser(): Promise<string> {
  const { chromium } = await import("playwright");
  const braveProfile =
    process.env.BRAVE_PROFILE ??
    resolve(process.env.HOME ?? "", ".config/BraveSoftware/Brave-Browser/Default");
  const braveBin = process.env.BRAVE_BIN ?? "/opt/brave.com/brave/brave";

  if (!existsSync(braveProfile)) {
    throw new Error(`Brave profile not found at ${braveProfile} — set BRAVE_PROFILE or use SMOKE_EMAIL/SMOKE_PASSWORD`);
  }

  const copied = mkdtempSync(resolve(tmpdir(), "fc-auth-smoke-"));
  try {
    cpSync(braveProfile, copied, {
      recursive: true,
      filter: (src) => !src.endsWith("SingletonLock") && !src.endsWith("lockfile"),
    });

    const context = await chromium.launchPersistentContext(copied, {
      headless: process.env.HEADLESS === "1",
      executablePath: existsSync(braveBin) ? braveBin : undefined,
      viewport: { width: 1280, height: 800 },
    });

    try {
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(`${BASE}/today`, { waitUntil: "domcontentloaded", timeout: 120_000 });

      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        const url = page.url();
        if (!url.includes("/sign-in") && !url.includes("/sign-up")) break;
        await page.waitForTimeout(500);
      }
      if (page.url().includes("/sign-in")) {
        throw new Error("Browser still on /sign-in — complete OAuth in the window or set SMOKE_EMAIL/SMOKE_PASSWORD");
      }

      const cookies = await context.cookies(BASE);
      const hit = cookies.find((c) => c.name === sessionCookieName());
      if (!hit?.value) throw new Error(`No ${sessionCookieName()} cookie after browser auth`);
      return hit.value;
    } finally {
      await context.close();
    }
  } finally {
    rmSync(copied, { recursive: true, force: true });
  }
}

async function tryMintJwtSession(isProdBase: boolean): Promise<{ token: string; source: string } | null> {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) return null;

  const hetznerPassword = process.env.FLEETCROWN_DB_PASSWORD;
  const hetznerHost = process.env.HETZNER_IP;
  const dbUrl = isProdBase && hetznerPassword && hetznerHost
    ? `postgres://fleetcrown:${encodeURIComponent(hetznerPassword)}@${hetznerHost}:5432/fleetcrown?sslmode=require`
    : process.env.DATABASE_URL;
  if (!dbUrl) return null;

  const postgres = (await import("postgres")).default;
  const sql = postgres(dbUrl, { max: 1 });
  try {
    const rows = await sql`
      SELECT id, email, name, username, onboarded_at
      FROM users
      WHERE is_default = true OR email IS NOT NULL
      ORDER BY is_default DESC, created_at ASC
      LIMIT 1
    `;
    const u = rows[0] as {
      id: string;
      email: string | null;
      name: string | null;
      username: string | null;
      onboarded_at: Date | null;
    } | undefined;
    if (!u?.id) return null;

    const { encode } = await import("@auth/core/jwt");
    const token = await encode({
      token: {
        id: u.id,
        email: u.email,
        name: u.name,
        username: u.username,
        onboardedAt: u.onboarded_at,
        onboardingComplete: Boolean(u.username && u.onboarded_at),
        sub: u.id,
      },
      secret,
      salt: sessionCookieName(),
    });

    // Validate the minted token works against the target host before returning.
    const probe = await fetch(`${BASE}/api/me`, {
      headers: { Cookie: `${sessionCookieName()}=${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!probe.ok) return null;
    return { token, source: "jwt-mint" };
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}

async function resolveSessionToken(): Promise<{ token: string; source: string }> {
  const fromEnv = smokeSessionToken().trim();
  if (fromEnv) return { token: fromEnv, source: "FLEETCROWN_SESSION_TOKEN" };

  const isProdBase = BASE.includes("fleetcrown.orangecat.ch") || BASE.includes("orangecat.ch");

  const smokeEmail = process.env.SMOKE_EMAIL?.trim();
  const smokePassword = process.env.SMOKE_PASSWORD;
  if (smokeEmail && smokePassword) {
    const token = await signInWithCredentials(smokeEmail, smokePassword);
    return { token, source: "credentials" };
  }

  const minted = await tryMintJwtSession(isProdBase);
  if (minted) return minted;
  const hetznerPassword = process.env.FLEETCROWN_DB_PASSWORD;
  const hetznerHost = process.env.HETZNER_IP;

  const dbUrls: { url: string; source: string }[] = [];
  if (isProdBase && hetznerPassword && hetznerHost) {
    dbUrls.push({
      url: `postgres://fleetcrown:${encodeURIComponent(hetznerPassword)}@${hetznerHost}:5432/fleetcrown?sslmode=require`,
      source: "hetzner-database",
    });
  }
  if (process.env.DATABASE_URL) {
    dbUrls.push({ url: process.env.DATABASE_URL, source: "database" });
  }

  if (dbUrls.length === 0 && !isProdBase) {
    throw new Error(
      "No session: set FLEETCROWN_SESSION_TOKEN, SMOKE_EMAIL+SMOKE_PASSWORD, or DATABASE_URL",
    );
  }

  if (dbUrls.length > 0) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    const { sessions } = await import("@/db/schema/auth");
    const { gt, desc } = await import("drizzle-orm");

    for (const { url, source } of dbUrls) {
      const sql = postgres(url, { max: 1 });
      const db = drizzle(sql);
      try {
        const rows = await db
          .select({ sessionToken: sessions.sessionToken })
          .from(sessions)
          .where(gt(sessions.expires, new Date()))
          .orderBy(desc(sessions.expires))
          .limit(1);
        const token = rows[0]?.sessionToken;
        if (token) {
          await sql.end({ timeout: 5 });
          return { token, source };
        }
      } finally {
        await sql.end({ timeout: 5 }).catch(() => undefined);
      }
    }
  }

  // JWT strategy: sessions table is empty — fall back to Brave profile on prod.
  const browserMode = process.env.AUTH_MODE === "browser" || isProdBase;
  if (browserMode) {
    const token = await resolveSessionFromBrowser();
    return { token, source: "browser-profile" };
  }

  throw new Error(
    "No session: set FLEETCROWN_SESSION_TOKEN, SMOKE_EMAIL+SMOKE_PASSWORD, or AUTH_MODE=browser",
  );
}

function mergeCookieHeader(base: string, setCookie: string | null): string {
  if (!setCookie) return base;
  const parts = new Map<string, string>();
  for (const chunk of base.split(";").map((s) => s.trim()).filter(Boolean)) {
    const eq = chunk.indexOf("=");
    if (eq > 0) parts.set(chunk.slice(0, eq), chunk.slice(eq + 1));
  }
  for (const raw of setCookie.split(/,(?=[^;]+?=)/)) {
    const first = raw.split(";")[0]?.trim();
    if (!first) continue;
    const eq = first.indexOf("=");
    if (eq > 0) parts.set(first.slice(0, eq), first.slice(eq + 1));
  }
  return [...parts.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function probe(
  cookieHeader: string,
  route: string,
  opts: {
    method?: "GET" | "POST";
    body?: unknown;
    expectStatus?: number[];
    checkBody?: boolean;
    jsonOk?: boolean;
    label?: string;
  } = {},
): Promise<ProbeResult> {
  const method = opts.method ?? "GET";
  const expect = opts.expectStatus ?? [200, 201, 204];
  const headers: Record<string, string> = {
    Cookie: cookieHeader,
  };
  if (method === "POST") headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${BASE}${route}`, {
      method,
      headers,
      body: method === "POST" && opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e) {
    return {
      route: opts.label ?? route,
      method,
      status: 0,
      ok: false,
      note: e instanceof Error ? e.message : "fetch failed",
    };
  }

  const text = await res.text();
  let note: string | undefined;

  if (opts.checkBody && text.includes(ERROR_BOUNDARY)) {
    return { route: opts.label ?? route, method, status: res.status, ok: false, note: "error boundary" };
  }

  if (opts.jsonOk && res.ok) {
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      if (json.error && !json.ok) note = String(json.error).slice(0, 120);
      if (json.success === false) note = String(json.error ?? "success:false").slice(0, 120);
    } catch {
      note = "invalid JSON";
    }
  }

  const ok = expect.includes(res.status) && !note;
  return { route: opts.label ?? route, method, status: res.status, ok, note };
}

async function main(): Promise<void> {
  // Reachability
  try {
    await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(20_000) });
  } catch {
    console.error(`✗ no server at ${BASE}`);
    process.exit(2);
  }

  const { token, source } = await resolveSessionToken();
  console.log(`→ authenticated smoke @ ${BASE} (session: ${source})`);

  let cookieHeader = `${sessionCookieName()}=${token}`;

  const pinStatus = await probe(cookieHeader, "/api/auth/pin", { expectStatus: [200] });
  let privateZoneLocked = false;
  try {
    const pinRes = await fetch(`${BASE}/api/auth/pin`, {
      headers: { Cookie: cookieHeader },
      signal: AbortSignal.timeout(15_000),
    });
    if (pinRes.ok) {
      const pin = (await pinRes.json()) as { configured?: boolean; unlocked?: boolean };
      privateZoneLocked = Boolean(pin.configured && !pin.unlocked);
    }
  } catch { /* ignore */ }

  const smokePin = process.env.SMOKE_PRIVATE_PIN;
  if (privateZoneLocked && smokePin) {
    const unlockRes = await fetch(`${BASE}/api/auth/pin`, {
      method: "POST",
      headers: {
        Cookie: cookieHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pin: smokePin }),
      signal: AbortSignal.timeout(15_000),
    });
    cookieHeader = mergeCookieHeader(cookieHeader, unlockRes.headers.get("set-cookie"));
    if (unlockRes.ok) {
      privateZoneLocked = false;
      console.log("  ok   PIN unlocked for private-zone probes");
    } else {
      console.log(`  warn PIN unlock failed (${unlockRes.status}) — private APIs may 403`);
    }
  } else if (privateZoneLocked) {
    console.log("  note private zone locked — set SMOKE_PRIVATE_PIN to probe private APIs");
  }

  const probes: ProbeResult[] = [];
  probes.push(pinStatus);

  const pageRoutes = [
    "/today",
    "/loki",
    "/terminal",
    "/control",
    "/control/import",
    "/control/import-local",
    "/control/new-from-scratch",
    "/control/workspace",
    "/projects",
    "/goals",
    "/people",
    "/habits",
    "/events",
    "/money",
    "/memory",
    "/activity",
    "/prompts",
    "/system",
    "/settings",
    "/onboarding",
    "/unlock",
  ];

  for (const route of pageRoutes) {
    probes.push(await probe(cookieHeader, route, { checkBody: true, expectStatus: [200, 307, 308] }));
  }

  const apiGets = [
    "/api/me",
    "/api/onboarding",
    "/api/crons",
    "/api/goals",
    "/api/habits",
    "/api/people",
    "/api/events",
    "/api/control",
    "/api/control/agent",
    "/api/control/commands",
    "/api/user-projects",
    "/api/invitations",
    "/api/sessions",
    "/api/sessions/snapshot",
    "/api/prompts/agent",
    "/api/prompts",
    "/api/captures",
    "/api/beacon-settings",
    "/api/orgs",
    "/api/agent-tokens",
    "/api/conversations",
    "/api/agents",
    "/api/notification-preferences",
    "/api/me/preferences",
    "/api/fleet/status",
    "/api/builder/presence",
    "/api/metrics",
    "/api/settings/fleet-lifecycle",
    "/api/github/repos",
  ];

  const privateZoneGets = new Set(["/api/goals", "/api/habits", "/api/people", "/api/events"]);

  for (const route of apiGets) {
    const expectStatus = privateZoneGets.has(route) && privateZoneLocked ? [200, 403] : [200];
    probes.push(await probe(cookieHeader, route, { jsonOk: true, expectStatus }));
  }

  // Workspaces: expect 403 on hosted (not allowlisted) or 200/405 — not 401/500
  probes.push(
    await probe(cookieHeader, "/api/workspaces", {
      expectStatus: [200, 403, 405],
      label: "/api/workspaces (gated)",
    }),
  );

  // Stripe portal — configured or 503
  probes.push(await probe(cookieHeader, "/api/stripe/portal", { expectStatus: [200, 303, 307, 503] }));

  // Dynamic detail routes from list payloads
  const headers = { Cookie: cookieHeader };

  const peopleRes = await fetch(`${BASE}/api/people?limit=1`, { headers, signal: AbortSignal.timeout(30_000) });
  if (peopleRes.ok) {
    const data = (await peopleRes.json()) as { people?: { id: string }[] };
    const id = data.people?.[0]?.id;
    if (id) probes.push(await probe(cookieHeader, `/api/people/${id}`, { jsonOk: true, label: "/api/people/<id>" }));
  }

  const upRes = await fetch(`${BASE}/api/user-projects`, { headers, signal: AbortSignal.timeout(30_000) });
  if (upRes.ok) {
    const rows = (await upRes.json()) as { entityProjectId?: string; id?: string; name?: string }[];
    const entityId = rows[0]?.entityProjectId;
    const upId = rows[0]?.id;
    if (entityId) {
      probes.push(await probe(cookieHeader, `/api/projects/${entityId}`, { jsonOk: true, label: "/api/projects/<id>" }));
    }
    if (upId) {
      probes.push(
        await probe(cookieHeader, `/api/user-projects/${upId}/publish-orangecat`, {
          jsonOk: true,
          label: "/api/user-projects/<id>/publish-orangecat",
        }),
      );
    }
  }

  const convRes = await fetch(`${BASE}/api/conversations`, { headers, signal: AbortSignal.timeout(30_000) });
  if (convRes.ok) {
    const convs = (await convRes.json()) as { id: string }[];
    const cid = convs[0]?.id;
    if (cid) {
      probes.push(await probe(cookieHeader, `/api/conversations/${cid}`, { jsonOk: true, label: "/api/conversations/<id>" }));
    }
  }

  // Tool-dependent GETs — 200 or graceful 502/503, never 500
  for (const route of ["/api/calendar", "/api/weather", "/api/github"]) {
    probes.push(
      await probe(cookieHeader, route, {
        expectStatus: [200, 502, 503, 504],
        label: `${route} (tool-dependent)`,
      }),
    );
  }

  // Private zone PIN status (already probed above; omit duplicate)

  let passed = 0;
  let failed = 0;
  for (const p of probes) {
    if (p.ok) {
      passed += 1;
      console.log(`  ok   ${String(p.status).padStart(3)}  ${p.route}`);
    } else {
      failed += 1;
      const extra = p.note ? `  (${p.note})` : "";
      console.log(`  FAIL ${String(p.status).padStart(3)}  ${p.route}${extra}`);
    }
  }

  const report: Report = {
    base: BASE,
    ranAt: new Date().toISOString(),
    sessionSource: source,
    privateZoneLocked,
    passed,
    failed,
    probes,
  };

  const outDir = resolve(process.cwd(), ".tmp");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "authenticated-smoke-report.json"), JSON.stringify(report, null, 2));

  console.log("");
  if (failed > 0) {
    console.log(`✗ ${failed}/${probes.length} authenticated probe(s) failed`);
    process.exit(1);
  }
  console.log(`✓ all ${probes.length} authenticated probes ok`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
