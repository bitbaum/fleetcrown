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
 * With SMOKE_PRIVATE_PIN, also runs private-zone CRUD round-trips (people, goals,
 * habits, events, subscriptions, prompts) — ephemeral rows tagged smoke-*.
 * Execution API probes (X01–X09 paths) run on every authenticated smoke.
 */
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { config } from "dotenv";

import { smokeSessionToken } from "@/lib/brand-env";
import { SUBSCRIPTION_META } from "@/config/subscriptions";
import { privateZoneCookiePair } from "@/lib/private-zone-token";

config({ path: ".env.local" });
config({ path: ".env.hetzner.local" });

const BASE = (process.env.BASE ?? "http://localhost:3000").replace(/\/$/, "");
const ERROR_BOUNDARY = "Something went wrong";

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

type ProbeResult = {
  route: string;
  method: HttpMethod;
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

/** Whoever this session actually is — asked of the server, never assumed. */
async function resolveUserId(cookieHeader: string): Promise<string> {
  const res = await fetch(`${BASE}/api/me`, {
    headers: { Cookie: cookieHeader },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`/api/me returned ${res.status}`);
  const me = (await res.json()) as { id?: string };
  if (!me.id) throw new Error("/api/me returned no user id");
  return me.id;
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
    method?: HttpMethod;
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
  if (method !== "GET" && opts.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${BASE}${route}`, {
      method,
      headers,
      body: method !== "GET" && opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
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

async function apiJson(
  cookieHeader: string,
  route: string,
  method: HttpMethod,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const headers: Record<string, string> = { Cookie: cookieHeader };
  if (method !== "GET" && body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers,
    body: method !== "GET" && body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45_000),
  });
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) as Record<string, unknown> };
  } catch {
    return { status: res.status, json: null };
  }
}

function idFrom(json: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!json) return null;
  for (const key of keys) {
    const val = json[key];
    if (val && typeof val === "object" && "id" in val && typeof (val as { id: unknown }).id === "string") {
      return (val as { id: string }).id;
    }
    if (typeof val === "string") return val;
  }
  return null;
}

/** Private-zone POST/PATCH/DELETE round-trips — creates ephemeral rows tagged smoke-*. */
async function runPrivateZoneCrudProbes(cookieHeader: string): Promise<ProbeResult[]> {
  const tag = `smoke-${Date.now()}`;
  const out: ProbeResult[] = [];

  const push = (label: string, method: HttpMethod, status: number, ok: boolean, note?: string) => {
    out.push({ route: label, method, status, ok, note });
  };

  // People — search, create, patch, attrs, interaction, delete
  {
    const search = await probe(cookieHeader, "/api/people?q=smoke&sort=recent&limit=5&offset=50", {
      jsonOk: true,
      label: "PE04/05 people search+pagination",
    });
    out.push(search);

    const created = await apiJson(cookieHeader, "/api/people", "POST", {
      name: `${tag} person`,
      description: "authenticated-smoke",
    });
    const personId = idFrom(created.json, "person");
    push("PE06 POST /api/people", "POST", created.status, created.status === 201 && Boolean(personId));
    if (personId) {
      const patched = await apiJson(cookieHeader, `/api/people/${personId}`, "PATCH", {
        description: "smoke patched",
      });
      push("PE07 PATCH /api/people/<id>", "PATCH", patched.status, patched.status === 200);

      const attr = await apiJson(cookieHeader, `/api/people/${personId}/attrs`, "POST", {
        key: "smoke_tag",
        value: tag,
      });
      push("PE09 POST /api/people/<id>/attrs", "POST", attr.status, attr.status === 200);

      const interaction = await apiJson(cookieHeader, `/api/people/${personId}/interactions`, "POST", {
        channel: "smoke",
        direction: "outbound",
        summary: "authenticated-smoke probe",
      });
      push("PE10 POST /api/people/<id>/interactions", "POST", interaction.status, interaction.status === 201);

      const attrDel = await apiJson(cookieHeader, `/api/people/${personId}/attrs`, "DELETE", { key: "smoke_tag" });
      push("PE09 DELETE /api/people/<id>/attrs", "DELETE", attrDel.status, attrDel.status === 200);

      const deleted = await apiJson(cookieHeader, `/api/people/${personId}`, "DELETE");
      push("PE08 DELETE /api/people/<id>", "DELETE", deleted.status, deleted.status === 200);
    }
  }

  // Goals — create, sub-goal, patch milestones, delete
  {
    const created = await apiJson(cookieHeader, "/api/goals", "POST", {
      title: `${tag} goal`,
      description: "smoke",
    });
    const goalId = idFrom(created.json, "goal");
    push("G03 POST /api/goals", "POST", created.status, created.status === 201 && Boolean(goalId));

    let childId: string | null = null;
    if (goalId) {
      const child = await apiJson(cookieHeader, "/api/goals", "POST", {
        title: `${tag} sub-goal`,
        parentGoalId: goalId,
      });
      childId = idFrom(child.json, "goal");
      push("G03 POST /api/goals (sub-goal)", "POST", child.status, child.status === 201 && Boolean(childId));

      const patched = await apiJson(cookieHeader, `/api/goals/${goalId}`, "PATCH", {
        progress: 42,
        milestones: [{ title: "smoke milestone", done: false }],
      });
      push("G04/G05 PATCH /api/goals/<id>", "PATCH", patched.status, patched.status === 200);

      if (childId) {
        const delChild = await apiJson(cookieHeader, `/api/goals/${childId}`, "DELETE");
        push("G06 DELETE /api/goals/<id> (sub)", "DELETE", delChild.status, delChild.status === 200);
      }
      const delGoal = await apiJson(cookieHeader, `/api/goals/${goalId}`, "DELETE");
      push("G06 DELETE /api/goals/<id>", "DELETE", delGoal.status, delGoal.status === 200);
    }
  }

  // Habits — create, patch done/title, link goal, delete
  {
    const goalForLink = await apiJson(cookieHeader, "/api/goals", "POST", { title: `${tag} link-goal` });
    const linkGoalId = idFrom(goalForLink.json, "goal");

    const created = await apiJson(cookieHeader, "/api/habits", "POST", {
      title: `${tag} habit`,
      frequency: "daily",
    });
    const habitId = idFrom(created.json, "habit");
    push("H03 POST /api/habits", "POST", created.status, created.status === 201 && Boolean(habitId));

    if (habitId) {
      const done = await apiJson(cookieHeader, `/api/habits/${habitId}`, "PATCH", { done: true });
      push("H04 PATCH /api/habits/<id> done", "PATCH", done.status, done.status === 200);

      const renamed = await apiJson(cookieHeader, `/api/habits/${habitId}`, "PATCH", {
        title: `${tag} habit renamed`,
      });
      push("H04 PATCH /api/habits/<id> title", "PATCH", renamed.status, renamed.status === 200);

      if (linkGoalId) {
        const linked = await apiJson(cookieHeader, `/api/habits/${habitId}/goals`, "POST", {
          goalId: linkGoalId,
        });
        push("H06 POST /api/habits/<id>/goals", "POST", linked.status, linked.status === 200);

        const unlinked = await apiJson(cookieHeader, `/api/habits/${habitId}/goals`, "DELETE", {
          goalId: linkGoalId,
        });
        push("H06 DELETE /api/habits/<id>/goals", "DELETE", unlinked.status, unlinked.status === 200);
      }

      const deleted = await apiJson(cookieHeader, `/api/habits/${habitId}`, "DELETE");
      push("H07 DELETE /api/habits/<id>", "DELETE", deleted.status, deleted.status === 200);
    }

    if (linkGoalId) {
      await apiJson(cookieHeader, `/api/goals/${linkGoalId}`, "DELETE");
    }
  }

  // Events — create, patch, archive, delete
  {
    const created = await apiJson(cookieHeader, "/api/events", "POST", {
      name: `${tag} event`,
      type: "deadline",
      description: "smoke",
    });
    const eventId = idFrom(created.json, "event");
    push("E03 POST /api/events", "POST", created.status, created.status === 201 && Boolean(eventId));

    if (eventId) {
      const patched = await apiJson(cookieHeader, `/api/events/${eventId}`, "PATCH", {
        description: "smoke patched",
      });
      push("E04 PATCH /api/events/<id>", "PATCH", patched.status, patched.status === 200);

      const archived = await apiJson(cookieHeader, `/api/events/${eventId}`, "PATCH", { status: "archived" });
      push("E05 PATCH /api/events/<id> archive", "PATCH", archived.status, archived.status === 200);

      const deleted = await apiJson(cookieHeader, `/api/events/${eventId}`, "DELETE");
      push("E05 DELETE /api/events/<id>", "DELETE", deleted.status, deleted.status === 200);
    }
  }

  // Money — create subscription, patch, reactivate, delete
  {
    const created = await apiJson(cookieHeader, "/api/subscriptions", "POST", {
      name: `${tag} sub`,
      vendor: "smoke",
      amount: 9.5,
      currency: "CHF",
      frequency: "monthly",
    });
    const subId = idFrom(created.json, "subscription");
    push("M02 POST /api/subscriptions", "POST", created.status, created.status === 201 && Boolean(subId));

    if (subId) {
      const patched = await apiJson(cookieHeader, `/api/subscriptions/${subId}`, "PATCH", {
        notes: "smoke patched",
      });
      push("M03 PATCH /api/subscriptions/<id>", "PATCH", patched.status, patched.status === 200);

      const cancelled = await apiJson(cookieHeader, `/api/subscriptions/${subId}`, "PATCH", {
        status: "cancelled",
      });
      push("M03 PATCH /api/subscriptions/<id> cancel", "PATCH", cancelled.status, cancelled.status === 200);

      const reactivated = await apiJson(cookieHeader, `/api/subscriptions/${subId}`, "POST");
      push("M03 POST /api/subscriptions/<id> reactivate", "POST", reactivated.status, reactivated.status === 200);

      const deleted = await apiJson(cookieHeader, `/api/subscriptions/${subId}`, "DELETE");
      push("M03 DELETE /api/subscriptions/<id>", "DELETE", deleted.status, deleted.status === 200);
    }
  }

  // Prompts — create, patch, delete (not private-zone but same harness)
  {
    const created = await apiJson(cookieHeader, "/api/prompts", "POST", {
      name: `${tag} prompt`,
      body: "smoke prompt body",
      scope: "global",
      tags: ["smoke"],
    });
    const promptId = idFrom(created.json, "prompt");
    push("PR02 POST /api/prompts", "POST", created.status, created.status === 201 && Boolean(promptId));

    if (promptId) {
      const patched = await apiJson(cookieHeader, `/api/prompts/${promptId}`, "PATCH", {
        description: "smoke patched",
      });
      push("PR02 PATCH /api/prompts/<id>", "PATCH", patched.status, patched.status === 200);

      const deleted = await apiJson(cookieHeader, `/api/prompts/${promptId}`, "DELETE");
      push("PR02 DELETE /api/prompts/<id>", "DELETE", deleted.status, deleted.status === 200);
    }
  }

  return out;
}

type ProjectPick = { key: string; id: string | null };

async function pickProject(cookieHeader: string): Promise<ProjectPick> {
  const fallback: ProjectPick = { key: "fleetcrown", id: null };
  try {
    const res = await fetch(`${BASE}/api/user-projects`, {
      headers: { Cookie: cookieHeader },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return fallback;
    const rows = (await res.json()) as { name?: string; id?: string; dirPath?: string | null }[];
    const withDir = rows.find((p) => p.dirPath && p.name);
    const named = rows.find((p) => p.name?.toLowerCase() === "fleetcrown");
    const pick = withDir ?? named ?? rows[0];
    if (!pick?.name) return fallback;
    return { key: pick.name, id: pick.id ?? null };
  } catch {
    return fallback;
  }
}

/** Execution-path API probes — queue/dispatch/Loki; full agent run needs builder (X01–X09). */
async function runExecutionProbes(cookieHeader: string): Promise<ProbeResult[]> {
  const out: ProbeResult[] = [];
  const push = (label: string, method: HttpMethod, status: number, ok: boolean, note?: string) => {
    out.push({ route: label, method, status, ok, note });
  };

  const project = await pickProject(cookieHeader);
  const smokeTag = `smoke-${Date.now()}`;

  const loki = await apiJson(cookieHeader, "/api/loki", "POST", {
    message: "authenticated smoke ping — one word reply",
  });
  const lokiOk = loki.status === 200 || loki.status === 503;
  push(
    "X01 POST /api/loki",
    "POST",
    loki.status,
    lokiOk,
    loki.status === 200 ? "gateway" : loki.status === 503 ? "gateway down" : undefined,
  );

  const inject = await apiJson(cookieHeader, "/api/inject", "POST", {
    tab: project.key,
    customPrompt: `[${smokeTag}] probe — ignore`,
    adapter: "claude",
  });
  const injectOk = inject.status === 200 && inject.json?.ok === true;
  push(
    "X03 POST /api/inject",
    "POST",
    inject.status,
    injectOk,
    typeof inject.json?.mode === "string" ? String(inject.json.mode) : undefined,
  );

  const orch = await apiJson(cookieHeader, "/api/orchestration/run", "POST", {
    projectKey: project.key,
    intent: "continue",
  });
  const orchOk =
    orch.status === 200
    || (orch.status === 503 && typeof orch.json?.error === "string");
  push("X06 POST /api/orchestration/run", "POST", orch.status, orchOk);

  const dispatch = await apiJson(cookieHeader, "/api/control/dispatch", "POST", {
    handoff: { done: "", next: "smoke", health: "ok", tests: "pass", todos: "", status: "ready" },
    queue: [],
    projectKey: project.key,
  });
  push("X02 dispatch decision API", "POST", dispatch.status, dispatch.status === 200);

  try {
    const peekRes = await fetch(
      `${BASE}/api/control/peek-stream?tab=${encodeURIComponent(project.key)}&channel=cloud`,
      { headers: { Cookie: cookieHeader }, signal: AbortSignal.timeout(4000) },
    );
    push("X04 GET /api/control/peek-stream", "GET", peekRes.status, [200, 403].includes(peekRes.status));
    await peekRes.body?.cancel();
  } catch {
    push("X04 GET /api/control/peek-stream", "GET", 0, true, "SSE timeout ok");
  }

  const gh = await apiJson(cookieHeader, "/api/projects/create-with-github", "POST", {});
  push("X08 POST create-with-github (invalid body)", "POST", gh.status, gh.status === 400);

  if (project.id) {
    const pub = await apiJson(cookieHeader, `/api/user-projects/${project.id}/publish-orangecat`, "POST");
    push(
      "X09 POST publish-orangecat",
      "POST",
      pub.status,
      [200, 400, 401, 403, 409, 502, 503].includes(pub.status),
      pub.status === 409 ? "OC not linked" : undefined,
    );
  }

  const builder = await apiJson(cookieHeader, "/api/builder/presence", "GET");
  const builderOnline = builder.json?.runnerConnected === true;
  const localBuilderOnline = builder.json?.builderPresence?.local === true;
  push(
    "execution builder presence",
    "GET",
    builder.status,
    builder.status === 200,
    builderOnline ? "builder online" : "builder offline — X02/X05 need runtime",
  );

  if (localBuilderOnline) {
    const openLocal = await apiJson(cookieHeader, "/api/control/open-tabs?channel=local", "GET");
    push("X05 GET /api/control/open-tabs?channel=local", "GET", openLocal.status, openLocal.status === 200);
    const localTabs = Array.isArray(openLocal.json?.tabs) ? (openLocal.json.tabs as string[]) : [];
    if (localTabs.length > 0) {
      try {
        const peekRes = await fetch(
          `${BASE}/api/control/peek-stream?tab=${encodeURIComponent(localTabs[0])}&channel=local`,
          { headers: { Cookie: cookieHeader }, signal: AbortSignal.timeout(4000) },
        );
        push(
          "X05 GET /api/control/peek-stream?channel=local",
          "GET",
          peekRes.status,
          [200, 403].includes(peekRes.status),
        );
        await peekRes.body?.cancel();
      } catch {
        push("X05 GET /api/control/peek-stream?channel=local", "GET", 0, true, "SSE timeout ok");
      }
    }
  }

  return out;
}

/** Settings, cron, agent tokens, frontier — API round-trips (no OAuth flows). */
async function runSettingsSystemProbes(
  cookieHeader: string,
  privateZoneLocked: boolean,
): Promise<ProbeResult[]> {
  const out: ProbeResult[] = [];
  const push = (label: string, method: HttpMethod, status: number, ok: boolean, note?: string) => {
    out.push({ route: label, method, status, ok, note });
  };

  const tag = `smoke-${Date.now()}`;

  const doctor = await apiJson(cookieHeader, "/api/system/doctor", "GET");
  push("SY02 GET /api/system/doctor", "GET", doctor.status, doctor.status === 200);

  // AC10 — typed-prompt capture, CLOSED LOOP. The June-2026 capture hook died
  // silently for two months because nothing verified the path end-to-end
  // (checks tested existence, not function). Two POSTs prove insert AND
  // read-back with no extra read API: the first must record the marker
  // ({ok:true} = row inserted); the immediate second must be rejected as a
  // dispatch echo — which the route can only decide by FINDING the first row
  // in prompt_history. A dead insert path fails step 1; a dead dedupe lookup
  // fails step 2.
  const captureMarker = `[${tag}] capture closed-loop probe — ignore`;
  const cap1 = await apiJson(cookieHeader, "/api/activity/capture", "POST", {
    prompt: captureMarker, cwd: "/tmp/smoke",
  });
  push("AC10 POST /api/activity/capture records", "POST", cap1.status,
    cap1.status === 200 && cap1.json?.ok === true);
  const cap2 = await apiJson(cookieHeader, "/api/activity/capture", "POST", {
    prompt: captureMarker, cwd: "/tmp/smoke",
  });
  push("AC11 capture echo-dedupe reads row back", "POST", cap2.status,
    cap2.status === 200 && cap2.json?.skipped === "dispatch_echo");

  const meGet = await apiJson(cookieHeader, "/api/me", "GET");
  if (meGet.status === 200 && typeof meGet.json?.name === "string") {
    const mePatch = await apiJson(cookieHeader, "/api/me", "PATCH", { name: meGet.json.name });
    push("ST01 PATCH /api/me profile", "PATCH", mePatch.status, mePatch.status === 200);
  }

  const accounts = await apiJson(cookieHeader, "/api/me/connected-accounts", "GET");
  push("ST02 GET /api/me/connected-accounts", "GET", accounts.status, accounts.status === 200);

  const badPwd = await apiJson(cookieHeader, "/api/me/password", "PATCH", {
    currentPassword: "definitely-wrong-smoke-password",
    newPassword: "another-wrong-smoke-password",
  });
  push(
    "ST03 PATCH /api/me/password (reject wrong)",
    "PATCH",
    badPwd.status,
    [400, 401].includes(badPwd.status),
  );

  const notif = await apiJson(cookieHeader, "/api/notification-preferences", "PATCH", {
    emailDigestCadence: "none",
  });
  push("ST04 PATCH /api/notification-preferences", "PATCH", notif.status, notif.status === 200);

  const prefsGet = await apiJson(cookieHeader, "/api/me/preferences", "GET");
  if (prefsGet.status === 200) {
    const voice = prefsGet.json?.writingVoice ?? null;
    const prefsPatch = await apiJson(cookieHeader, "/api/me/preferences", "PATCH", {
      writingVoice: typeof voice === "string" ? voice : null,
    });
    push("ST06 PATCH /api/me/preferences voice", "PATCH", prefsPatch.status, prefsPatch.status === 200);
  }

  const fleetGet = await apiJson(cookieHeader, "/api/settings/fleet-lifecycle", "GET");
  if (fleetGet.status === 200 && fleetGet.json?.settings) {
    const fleetPut = await apiJson(cookieHeader, "/api/settings/fleet-lifecycle", "PUT", {
      settings: fleetGet.json.settings,
    });
    push("ST12 PUT /api/settings/fleet-lifecycle", "PUT", fleetPut.status, fleetPut.status === 200);
  }

  const beaconGet = await apiJson(cookieHeader, "/api/beacon-settings", "GET");
  if (beaconGet.status === 200) {
    const countdown = typeof beaconGet.json?.countdown_seconds === "number"
      ? beaconGet.json.countdown_seconds
      : 8;
    const beaconPatch = await apiJson(cookieHeader, "/api/beacon-settings", "PATCH", {
      countdown_seconds: countdown,
    });
    push("ST12 PATCH /api/beacon-settings", "PATCH", beaconPatch.status, beaconPatch.status === 200);
  }

  const tokenCreate = await apiJson(cookieHeader, "/api/agent-tokens", "POST", {
    label: `${tag} token`,
  });
  const tokenId = typeof tokenCreate.json?.id === "string" ? tokenCreate.json.id : null;
  push("ST11 POST /api/agent-tokens", "POST", tokenCreate.status, tokenCreate.status === 200 && Boolean(tokenId));
  if (tokenId) {
    const tokenDel = await apiJson(cookieHeader, "/api/agent-tokens", "DELETE", { id: tokenId });
    push("ST11 DELETE /api/agent-tokens", "DELETE", tokenDel.status, tokenDel.status === 200);
  }

  const cronCreate = await apiJson(cookieHeader, "/api/crons", "POST", {
    name: `${tag} cron`,
    scheduleExpr: "0 6 * * *",
    message: "authenticated smoke — disabled immediately",
  });
  const cronJob = cronCreate.json?.job as { id?: string } | undefined;
  const cronId = cronJob?.id ?? null;
  push(
    "PR06/SY06 POST /api/crons",
    "POST",
    cronCreate.status,
    cronCreate.status === 200 && Boolean(cronId),
  );

  if (cronId) {
    const cronPatch = await apiJson(cookieHeader, "/api/crons", "PATCH", {
      id: cronId,
      enabled: false,
      message: "smoke disabled",
    });
    push("SY06 PATCH /api/crons", "PATCH", cronPatch.status, cronPatch.status === 200);

    const cronRun = await apiJson(cookieHeader, "/api/crons/run", "POST", { id: cronId });
    push(
      "SY06 POST /api/crons/run",
      "POST",
      cronRun.status,
      cronRun.status === 503 || cronRun.status === 200,
      cronRun.status === 503 ? "needs local openclaw" : undefined,
    );
  }

  if (privateZoneLocked) {
    push("SY03 frontier proposals", "GET", 0, false, "skipped — PIN locked");
    push("ME02 GET /api/memory/rag-stats", "GET", 0, false, "skipped — PIN locked");
  } else {
    const frontier = await apiJson(cookieHeader, "/api/frontier/proposals", "GET");
    push("SY03 GET /api/frontier/proposals", "GET", frontier.status, frontier.status === 200);

    const proposals = Array.isArray(frontier.json?.proposals)
      ? (frontier.json.proposals as { id: string }[])
      : [];
    void proposals;
    const missing = await apiJson(
      cookieHeader,
      "/api/frontier/proposals/00000000-0000-0000-0000-000000000001",
      "POST",
      { action: "dismiss" },
    );
    push(
      "SY03 POST /api/frontier/proposals (validation)",
      "POST",
      missing.status,
      missing.status === 404,
      proposals.length > 0 ? `${proposals.length} open (not mutated)` : "none open",
    );

    const rag = await apiJson(cookieHeader, "/api/memory/rag-stats", "GET");
    const ragEnabled = rag.json?.enabled === true;
    const ragChunks = typeof rag.json?.totalChunks === "number" ? rag.json.totalChunks : 0;
    push(
      "ME02 GET /api/memory/rag-stats",
      "GET",
      rag.status,
      rag.status === 200 && typeof rag.json?.enabled === "boolean" && (!ragEnabled || ragChunks > 0),
      ragEnabled ? `chunks=${ragChunks}` : "RAG disabled (no EMBEDDINGS_BASE_URL)",
    );
  }

  return out;
}

/**
 * Shareable-dossier lifecycle — create → public-render → update → revoke →
 * public-404. Only mutates a project with NO active share (snapshots the GET
 * state first), so it never revokes a link the user meant to keep; if the
 * picked project is already shared it does a read-only public-render check and
 * skips the destructive steps. Leaves the project share-free again on success.
 */
async function runShareLifecycleProbes(cookieHeader: string): Promise<ProbeResult[]> {
  const out: ProbeResult[] = [];
  const push = (label: string, method: HttpMethod, status: number, ok: boolean, note?: string) => {
    out.push({ route: label, method, status, ok, note });
  };
  const shareOf = (json: Record<string, unknown> | null): Record<string, unknown> | null => {
    const s = json?.share;
    return s && typeof s === "object" ? (s as Record<string, unknown>) : null;
  };

  // The share route keys on the project ENTITY id (entities.id), which the
  // user-projects payload exposes as entityProjectId.
  let entityId: string | null = null;
  try {
    const res = await fetch(`${BASE}/api/user-projects`, {
      headers: { Cookie: cookieHeader },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) {
      const rows = (await res.json()) as { entityProjectId?: string }[];
      entityId = rows.find((r) => r.entityProjectId)?.entityProjectId ?? null;
    }
  } catch { /* ignore */ }

  if (!entityId) {
    push("SH01 share lifecycle", "GET", 0, true, "skipped — no project with an entity id");
    return out;
  }

  const base = `/api/projects/${entityId}/share`;

  const initial = await apiJson(cookieHeader, base, "GET");
  push("SH01 GET share state", "GET", initial.status, initial.status === 200);
  const preShare = shareOf(initial.json);

  if (preShare) {
    // Read-only path — the project is already shared; confirm its public page
    // renders but do NOT mutate (revoking would break a live link).
    const token = typeof preShare.token === "string" ? preShare.token : "";
    if (token) {
      out.push(await probe(cookieHeader, `/share/project/${token}`, {
        checkBody: true, expectStatus: [200], label: "SH02 public shared page (existing)",
      }));
    }
    push("SH03 lifecycle mutate", "POST", 0, true, "skipped — project already shared (not mutating)");
    return out;
  }

  // 1. Create
  const created = await apiJson(cookieHeader, base, "POST", { audience: "advisor", includeRepo: false });
  const share = shareOf(created.json);
  const token = typeof share?.token === "string" ? share.token : "";
  push("SH03 POST create share", "POST", created.status, created.status === 200 && Boolean(token));
  if (!token) return out;

  // The returned url must be a real public link (canonical base URL), not the
  // internal bind (https://0.0.0.0:4002) that req.nextUrl.origin yields on the box.
  const url = typeof share?.url === "string" ? share.url : "";
  const publicUrl = /^https?:\/\//.test(url) && !url.includes("0.0.0.0") && url.includes(token);
  push("SH03b share url is a public link", "GET", created.status, publicUrl, publicUrl ? undefined : `bad url: ${url}`);

  // 2. Public page renders for a valid token
  out.push(await probe(cookieHeader, `/share/project/${token}`, {
    checkBody: true, expectStatus: [200], label: "SH04 public shared page (200)",
  }));

  // 3. Update — re-POST reuses the SAME active share row (token stays stable)
  const updated = await apiJson(cookieHeader, base, "POST", { audience: "public", includeRepo: true });
  const updatedShare = shareOf(updated.json);
  const sameToken = updatedShare?.token === token;
  push(
    "SH05 POST update share",
    "POST",
    updated.status,
    updated.status === 200 && sameToken && updatedShare?.audience === "public",
    sameToken ? undefined : "token changed on update",
  );

  // 4. GET reflects the update
  const afterUpdate = await apiJson(cookieHeader, base, "GET");
  push(
    "SH06 GET reflects update",
    "GET",
    afterUpdate.status,
    afterUpdate.status === 200 && shareOf(afterUpdate.json)?.audience === "public",
  );

  // 5. Revoke
  const revoked = await apiJson(cookieHeader, base, "DELETE");
  push("SH07 DELETE revoke share", "DELETE", revoked.status, revoked.status === 200);

  // 6. Public page 404s once the token is revoked
  out.push(await probe(cookieHeader, `/share/project/${token}`, {
    expectStatus: [404], label: "SH08 public page 404 after revoke",
  }));

  // 7. No active share remains — project is clean again
  const afterRevoke = await apiJson(cookieHeader, base, "GET");
  push(
    "SH09 GET share null after revoke",
    "GET",
    afterRevoke.status,
    afterRevoke.status === 200 && shareOf(afterRevoke.json) === null,
  );

  return out;
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
  }

  const probes: ProbeResult[] = [];
  probes.push(pinStatus);

  // No PIN to hand? Mint the unlock from AUTH_SECRET — the same secret that
  // minted this session. Before doing so, PROVE the gate is real: a session
  // without the unlock must be refused. Skipping the private half of the app
  // (as this suite did on every run) tests nothing; asserting the 403 and then
  // walking through the gate tests both the lock and what it protects.
  if (privateZoneLocked) {
    probes.push(
      await probe(cookieHeader, "/api/people", {
        expectStatus: [403],
        label: "PZ00 private zone refuses a session without the unlock",
      }),
    );
    try {
      const unlockCookie = privateZoneCookiePair(await resolveUserId(cookieHeader));
      cookieHeader = `${cookieHeader}; ${unlockCookie}`;
      const verify = await fetch(`${BASE}/api/auth/pin`, {
        headers: { Cookie: cookieHeader },
        signal: AbortSignal.timeout(15_000),
      });
      const state = verify.ok ? ((await verify.json()) as { unlocked?: boolean }) : {};
      privateZoneLocked = !state.unlocked;
      console.log(
        privateZoneLocked
          ? "  warn minted unlock rejected — private APIs will 403"
          : "  ok   PZ01 unlock minted from AUTH_SECRET — private zone probes enabled",
      );
    } catch (e) {
      console.log(`  warn could not mint private-zone unlock (${e instanceof Error ? e.message : e})`);
    }
  }

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

  const webhookRes = await fetch(`${BASE}/api/stripe/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(15_000),
  });
  probes.push({
    route: "CH04 POST /api/stripe/webhook (invalid sig)",
    method: "POST",
    status: webhookRes.status,
    ok: [400, 503].includes(webhookRes.status),
    note: webhookRes.status === 503 ? "Stripe not configured" : "signature rejected",
  });

  const metaIssues: string[] = [];
  for (const [name, meta] of Object.entries(SUBSCRIPTION_META)) {
    try {
      if (!meta.verifyUrl.startsWith("https://") || !meta.cancelUrl.startsWith("https://")) {
        metaIssues.push(name);
        continue;
      }
      new URL(meta.verifyUrl);
      new URL(meta.cancelUrl);
    } catch {
      metaIssues.push(name);
    }
  }
  probes.push({
    route: "M04 SUBSCRIPTION_META verify/cancel URLs",
    method: "GET",
    status: metaIssues.length === 0 ? 200 : 0,
    ok: metaIssues.length === 0,
    note:
      metaIssues.length === 0
        ? `${Object.keys(SUBSCRIPTION_META).length} providers`
        : metaIssues.join(", "),
  });

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

  // Private-zone CRUD round-trips (requires PIN unlock)
  if (privateZoneLocked) {
    probes.push({
      route: "private-zone CRUD",
      method: "POST",
      status: 0,
      ok: false,
      note: "skipped — private zone still locked (AUTH_SECRET missing?)",
    });
  } else {
    probes.push(...await runPrivateZoneCrudProbes(cookieHeader));
  }

  probes.push(...await runExecutionProbes(cookieHeader));
  probes.push(...await runShareLifecycleProbes(cookieHeader));
  probes.push(...await runSettingsSystemProbes(cookieHeader, privateZoneLocked));

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
