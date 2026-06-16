// Authenticate an SSE connection against the existing agent_tokens table.
//
// The web app and Fleet Runner desktop already mint ck_*-prefixed tokens
// via Settings → Agent tokens; this just validates that the incoming
// token is one of those, bound to which user. We re-use the same lookup
// the cloud API uses (see src/db/queries/agent-tokens.ts) so the token
// surface is genuinely shared — there is no separate auth system that
// can drift.
//
// IMPORTANT: tokens are stored in plaintext in the `token` column today,
// keyed by the token itself rather than a hash. That's the existing
// scheme; we mirror it. When the cloud rotates to hashed storage (a
// follow-up), this validator updates in lockstep.
//
// Why query param instead of Authorization header: EventSource (the
// browser API for SSE) does not let JavaScript set custom request
// headers. The token-in-URL is the established workaround used by every
// SSE auth pattern in the wild (GitHub Actions logs, Datadog live tail,
// etc.). Mitigated by: HTTPS-only deploy and
// stripping query strings from access logs.

import type { Pool } from "pg";

const TOKEN_RE = /^ck_[a-f0-9]{48,}$/;

export interface AuthResult {
  ok: true;
  userId: string;
  tokenId: string;
}

export interface AuthFail {
  ok: false;
  reason: "missing" | "malformed" | "not-found" | "expired";
}

/**
 * Validate a plaintext ck_* token and return the bound user_id.
 *
 * Best-effort updates `last_used_at` for visibility; never blocks the
 * response on it.
 */
export async function validateToken(
  pool: Pool,
  rawToken: string | undefined | null,
): Promise<AuthResult | AuthFail> {
  if (!rawToken) return { ok: false, reason: "missing" };
  if (!TOKEN_RE.test(rawToken)) return { ok: false, reason: "malformed" };

  const { rows } = await pool.query<{ id: string; user_id: string; expires_at: string | null }>(
    `SELECT id, user_id, expires_at
       FROM agent_tokens
      WHERE token = $1
      LIMIT 1`,
    [rawToken],
  );

  if (rows.length === 0) return { ok: false, reason: "not-found" };
  const row = rows[0]!;

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  // Touch last_used_at without blocking the auth response.
  pool
    .query("UPDATE agent_tokens SET last_used_at = NOW() WHERE id = $1", [row.id])
    .catch(() => {});

  return { ok: true, userId: row.user_id, tokenId: row.id };
}
