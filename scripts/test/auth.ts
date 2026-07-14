/**
 * Inline self-tests for the security-critical auth primitives — the code whose
 * silent failure caused (or could cause) real incidents:
 *   - X OAuth 1.0a login tickets (forgery / tamper / expiry / empty-secret)
 *   - the env guardrail (whitespace-corrupted secrets, half-set provider pairs)
 *   - password hashing round-trip
 * All pure (no DB / network), framework-free. Run: npm run test:auth
 */
import crypto from "crypto";
import { mintTicket, verifyTicket } from "@/lib/x-oauth1";
import { checkEnv, envHealthy, type EnvIssue } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/password";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// Run checkEnv() against a fully-controlled env snapshot (set every key the
// validator reads to a clean value, then apply the case's overrides).
const ENV_KEYS = [
  "NODE_ENV", "AUTH_SECRET", "RESEND_API_KEY", "CRON_SECRET",
  "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
  "X1_CONSUMER_KEY", "X1_CONSUMER_SECRET", "DATABASE_URL", "NEXTAUTH_URL", "EMAIL_FROM",
  "GROQ_API_KEY",
] as const;
const CLEAN_PROD_ENV: Record<string, string> = {
  NODE_ENV: "production",
  AUTH_SECRET: "s3cret-value",
  RESEND_API_KEY: "re_test",
  CRON_SECRET: "cron_test",
  GITHUB_CLIENT_ID: "gh_id", GITHUB_CLIENT_SECRET: "gh_sec",
  GOOGLE_CLIENT_ID: "go_id", GOOGLE_CLIENT_SECRET: "go_sec",
  X1_CONSUMER_KEY: "x_key", X1_CONSUMER_SECRET: "x_sec",
  DATABASE_URL: "postgres://x",
  NEXTAUTH_URL: "https://fleetcrown.orangecat.ch",
  EMAIL_FROM: "FleetCrown <noreply@fleetcrown.orangecat.ch>",
  GROQ_API_KEY: "gsk_test",
};

function checkEnvWith(overrides: Record<string, string | undefined>): EnvIssue[] {
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  try {
    const merged = { ...CLEAN_PROD_ENV, ...overrides };
    for (const k of ENV_KEYS) {
      if (merged[k] === undefined) delete process.env[k];
      else process.env[k] = merged[k];
    }
    return checkEnv();
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

async function runTests(): Promise<void> {
  let passed = 0;
  const check = async (label: string, fn: () => void | Promise<void>) => {
    await fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  };

  // ── X OAuth 1.0a tickets ────────────────────────────────────────────────
  const SAVED_SECRET = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "test-auth-secret-123";

  await check("ticket round-trips (mint → verify)", () => {
    const t = mintTicket({ xId: "4190014653", handle: "catomean" });
    const d = verifyTicket(t);
    assert(d?.xId === "4190014653" && d?.handle === "catomean", "round-trip mismatch");
  });

  await check("tampered ticket is rejected", () => {
    const t = mintTicket({ xId: "1", handle: "a" });
    const tampered = t.slice(0, -2) + (t.endsWith("AA") ? "BB" : "AA");
    assert(verifyTicket(tampered) === null, "tampered ticket verified");
  });

  await check("ticket signed with a different secret is rejected", () => {
    const t = mintTicket({ xId: "1", handle: "a" });
    process.env.AUTH_SECRET = "a-totally-different-secret";
    const rejected = verifyTicket(t) === null;
    process.env.AUTH_SECRET = "test-auth-secret-123";
    assert(rejected, "ticket from a different secret verified");
  });

  await check("expired ticket is rejected", () => {
    // Craft a ticket with a past exp, signed with the real secret.
    const payload = Buffer.from(JSON.stringify({ xId: "1", handle: "a", exp: Math.floor(Date.now() / 1000) - 10 })).toString("base64url");
    const sig = crypto.createHmac("sha256", "test-auth-secret-123").update(payload).digest("base64url");
    assert(verifyTicket(`${payload}.${sig}`) === null, "expired ticket verified");
  });

  await check("empty AUTH_SECRET throws (no forgeable empty-key tickets)", () => {
    process.env.AUTH_SECRET = "";
    let threw = false;
    try { mintTicket({ xId: "1", handle: "a" }); } catch { threw = true; }
    process.env.AUTH_SECRET = "test-auth-secret-123";
    assert(threw, "mintTicket did not throw on empty AUTH_SECRET");
  });

  await check("whitespace-corrupted AUTH_SECRET still round-trips (trimmed)", () => {
    process.env.AUTH_SECRET = "  trimmed-secret  \n";
    const t = mintTicket({ xId: "1", handle: "a" });
    const ok = verifyTicket(t)?.xId === "1";
    process.env.AUTH_SECRET = "test-auth-secret-123";
    assert(ok, "trimmed-secret round-trip failed");
  });

  process.env.AUTH_SECRET = SAVED_SECRET;

  // ── env guardrail ───────────────────────────────────────────────────────
  await check("clean prod env is healthy (no issues)", () => {
    const issues = checkEnvWith({});
    assert(issues.length === 0, `expected 0 issues, got ${JSON.stringify(issues)}`);
    assert(envHealthy(issues), "clean env reported unhealthy");
  });

  await check("whitespace-corrupted secret is flagged", () => {
    const issues = checkEnvWith({ AUTH_SECRET: "secret\n" });
    assert(issues.some((i) => i.key === "AUTH_SECRET" && i.level === "error"), "whitespace not flagged");
  });

  await check("half-set provider pair is flagged", () => {
    const issues = checkEnvWith({ GITHUB_CLIENT_SECRET: undefined });
    assert(issues.some((i) => i.key.includes("GITHUB") && i.level === "error"), "half-set pair not flagged");
    assert(!envHealthy(issues), "half-set pair should be unhealthy");
  });

  await check("missing AUTH_SECRET is fatal", () => {
    const issues = checkEnvWith({ AUTH_SECRET: undefined });
    assert(issues.some((i) => i.key === "AUTH_SECRET" && i.level === "fatal"), "missing AUTH_SECRET not fatal");
  });

  await check("non-https NEXTAUTH_URL flagged in prod", () => {
    const issues = checkEnvWith({ NEXTAUTH_URL: "http://insecure" });
    assert(issues.some((i) => i.key === "NEXTAUTH_URL" && i.level === "error"), "non-https URL not flagged");
  });

  await check("missing RESEND_API_KEY flagged in prod", () => {
    const issues = checkEnvWith({ RESEND_API_KEY: undefined });
    assert(issues.some((i) => i.key === "RESEND_API_KEY" && i.level === "error"), "missing RESEND_API_KEY not flagged");
  });

  // ── password hashing ────────────────────────────────────────────────────
  await check("password hash round-trips + rejects wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    assert(await verifyPassword("correct horse battery staple", hash) === true, "correct password rejected");
    assert(await verifyPassword("wrong password", hash) === false, "wrong password accepted");
  });

  console.log(`✓ ${passed} auth/env self-tests passed`);
}

runTests().catch((err) => {
  console.error("✗ test failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
