import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { ROUTES } from "@/config/auth";
import Google from "next-auth/providers/google";
import Twitter from "next-auth/providers/twitter";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { sql } from "drizzle-orm";
// db required here for DrizzleAdapter — not avoidable
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { verifyPassword } from "@/lib/password";
import { getDefaultUser, getUserById, getUserByEmail, updateUser } from "@/db/queries/users";
import { getOrgMembershipCount, createPersonalOrg } from "@/db/queries/orgs";
import { logDebug } from "@/db/queries/debug-logs";
import { healReturningUserOnboarding, onboardingCompleteFlag } from "@/lib/onboarding-heal";
import { isValidUuid } from "@/lib/utils";

/**
 * Auth.js wraps every authorize()→null return in a generic CredentialsSignin
 * error whose message is just "Read more at https://errors.authjs.dev/...",
 * which makes debug_logs forensics worthless when a user can't sign in.
 * This helper records the actual failure reason (provider + reason + identifier
 * minus password) BEFORE returning null, so the operator can tell apart
 * brute-force vs forgotten-password vs missing-account at a glance.
 */
function logAuthReject(
  provider: "local" | "email-password" | "user-password",
  reason: "missing-input" | "user-not-found" | "no-password-hash" | "wrong-password",
  identifier?: string | null,
): null {
  logDebug({
    source: "auth.authorize",
    level: "warn",
    message: `credentials rejected: ${provider} / ${reason}`,
    meta: { provider, reason, identifier: identifier ?? null },
  });
  return null;
}

/**
 * Companion to logAuthReject — records the matching success event so that
 * a 5-reject / 1-accept burst reads as "forgotten password recovered" and
 * a 5-reject / 0-accept burst reads as "locked out OR attacker bailed".
 * Without this, reject events float alone and the pair correlation is lost.
 */
function logAuthAccept(
  provider: "local" | "email-password" | "user-password",
  identifier: string | null | undefined,
  userId: string,
): void {
  logDebug({
    source: "auth.authorize",
    level: "info",
    message: `credentials accepted: ${provider}`,
    meta: { provider, identifier: identifier ?? null, userId },
  });
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
      username: string | null;
      onboardedAt: Date | null;
      onboardingComplete?: boolean;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    onboardingComplete?: boolean;
  }
}


export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // Persist Auth.js error events to the database — Vercel runtime logs aren't
  // reliably reachable from the CLI in this environment, and an auth failure that
  // can't be diagnosed is functionally a P0. Low write volume in steady state
  // (only fires on actual errors).
  logger: {
    error: (err) => {
      console.error("[auth.logger.error]", err?.name, err?.message, err);
      // Suppress the redundant catch-all row for CredentialsSignin — the
      // authorize() helpers already wrote a structured warn row with
      // provider/reason/identifier via logAuthReject; this row would only
      // add the useless "Read more at https://errors.authjs.dev/..."
      // message we replaced. Other error types (MissingCSRF, AccessDenied,
      // OAuthCallbackError, system errors) still flow through — they have
      // no dedicated logger and this is their only debug_logs surface.
      // Halves the row count on credentials brute-force bursts; verified
      // live by triggering a credentials reject and observing only the
      // auth.authorize row land.
      if ((err as { type?: string })?.type === "CredentialsSignin") return;
      const unwrapCause = (c: unknown, depth = 0): unknown => {
        if (!c || depth > 4) return c;
        if (c instanceof Error) {
          return {
            name: c.name,
            message: c.message,
            stack: c.stack?.split("\n").slice(0, 6).join("\n"),
            cause: unwrapCause((c as { cause?: unknown }).cause, depth + 1),
          };
        }
        if (typeof c === "object") {
          try {
            return JSON.parse(JSON.stringify(c, (_, v) => (v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v)));
          } catch {
            // JSON.stringify can throw on circular references (Auth.js internal
            // errors carry context refs that loop), BigInt values, etc. The old
            // fallback was `String(c)` which gave a useless "[object Object]"
            // and erased every signal — verified live in a 2026-05-19 accessdenied
            // entry whose only diagnostic was that literal string. Extract a
            // best-effort shape: constructor name plus the string/number/boolean
            // own-properties, plus any nested Error message.
            try {
              const o = c as Record<string, unknown>;
              const shape: Record<string, unknown> = {
                __ctor: (o?.constructor as { name?: string })?.name ?? "Object",
              };
              for (const k of Object.keys(o)) {
                const v = o[k];
                if (v instanceof Error) shape[k] = { name: v.name, message: v.message };
                else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) shape[k] = v;
              }
              return shape;
            } catch { return String(c); }
          }
        }
        return c;
      };
      const meta: Record<string, unknown> = {
        name: err?.name,
        type: (err as { type?: string })?.type,
        stack: err?.stack?.split("\n").slice(0, 8).join("\n"),
      };
      if (err?.cause) meta.cause = unwrapCause(err.cause);
      db.execute(sql`
        INSERT INTO debug_logs (source, level, message, meta)
        VALUES ('auth', 'error', ${err?.message ?? String(err)}, ${JSON.stringify(meta)}::jsonb)
      `).catch(() => {});
    },
  },
  events: {
    async signIn(message) {
      // Org bootstrap moved here from the signIn callback — at this point
      // `user.id` is the DB UUID (handleLoginOrRegister has run), so org
      // queries that join on uuid columns are safe.
      try {
        if (message.user?.id) {
          const existing = await getUserById(message.user.id);
          if (existing) {
            await healReturningUserOnboarding(existing);
          }

          const memberCount = await getOrgMembershipCount(message.user.id);
          if (memberCount === 0) {
            const displayName = message.user.name ?? message.user.email?.split("@")[0] ?? "user";
            await createPersonalOrg(message.user.id, displayName);
          }
        }
      } catch (e) {
        // Org bootstrap failures must not block sign-in. They'll surface in
        // debug_logs but the user still lands authenticated.
        db.execute(sql`
          INSERT INTO debug_logs (source, level, message, meta)
          VALUES ('auth', 'event:signIn-org-bootstrap', ${(e as Error)?.message ?? String(e)},
                  ${JSON.stringify({ userId: message.user?.id, name: (e as Error)?.name })}::jsonb)
        `).catch(() => {});
      }
    },
  },
  // Allow localhost and any host when AUTH_TRUST_HOST=true (local production server).
  // Vercel sets VERCEL=1 which Auth.js already trusts automatically.
  trustHost: process.env.AUTH_TRUST_HOST === "true" || process.env.VERCEL === "1",
  // JWT strategy required for Credentials provider to work alongside DB adapter
  session: { strategy: "jwt" },
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      allowDangerousEmailAccountLinking: true,
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? [
      Google({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        allowDangerousEmailAccountLinking: true,
      }),
    ] : []),
    ...(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET ? [
      Twitter({
        clientId: process.env.TWITTER_CLIENT_ID,
        clientSecret: process.env.TWITTER_CLIENT_SECRET,
        allowDangerousEmailAccountLinking: true,
      }),
    ] : []),
    Credentials({
      id: "local",
      name: "Local access",
      credentials: {
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const supplied = credentials.password as string | undefined;
        if (!supplied) return logAuthReject("local", "missing-input");

        const user = await getDefaultUser();
        if (!user) return logAuthReject("local", "user-not-found");

        // Env var takes priority (quick local dev). Falls back to DB hash (packaged installs).
        const envPassword = process.env.LOCAL_AUTH_PASSWORD;
        const ok = envPassword
          ? supplied === envPassword
          : user.passwordHash
            ? await verifyPassword(supplied, user.passwordHash)
            : false;

        if (!ok) return logAuthReject("local", envPassword || user.passwordHash ? "wrong-password" : "no-password-hash", user.email);
        logAuthAccept("local", user.email, user.id);
        return { id: user.id, email: user.email ?? "", name: user.name ?? "Local user" };
      },
    }),
    // Used by the sign-in form for multi-user email + password authentication.
    Credentials({
      id: "email-password",
      name: "Email and password",
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email    = credentials.email    as string | undefined;
        const password = credentials.password as string | undefined;
        if (!email || !password) return logAuthReject("email-password", "missing-input", email);

        const user = await getUserByEmail(email);
        if (!user) return logAuthReject("email-password", "user-not-found", email);
        if (!user.passwordHash) return logAuthReject("email-password", "no-password-hash", email);

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return logAuthReject("email-password", "wrong-password", email);
        logAuthAccept("email-password", email, user.id);
        return { id: user.id, email: user.email ?? "", name: user.name ?? "" };
      },
    }),
    // Used by the invite acceptance flow to sign in the newly-created invited user.
    Credentials({
      id: "user-password",
      name: "User password",
      credentials: {
        userId:   { label: "User ID",  type: "text"     },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const userId   = credentials.userId   as string | undefined;
        const password = credentials.password as string | undefined;
        if (!userId || !password) return logAuthReject("user-password", "missing-input", userId);

        const user = await getUserById(userId);
        if (!user) return logAuthReject("user-password", "user-not-found", userId);
        if (!user.passwordHash) return logAuthReject("user-password", "no-password-hash", userId);

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return logAuthReject("user-password", "wrong-password", userId);
        logAuthAccept("user-password", userId, user.id);
        return { id: user.id, email: user.email ?? "", name: user.name ?? "" };
      },
    }),
  ],
  pages: {
    signIn: ROUTES.SIGN_IN,
    signOut: ROUTES.SIGN_OUT,
  },
  callbacks: {
    async signIn({ user, account }) {
      // CRITICAL: at this point in the OAuth flow, user.id is the OAuth provider's
      // id (e.g. GitHub's numeric "41178744"), NOT the DB UUID. Passing it to any
      // query that joins on a uuid column trips PostgreSQL — which Auth.js wraps as
      // AccessDenied. Resolve to the DB user via email before any uuid-typed write.
      // Org bootstrap (which needs the real UUID) lives in events.signIn below.
      if (account?.type === "oauth" && user.email) {
        const existingUser = await getUserByEmail(user.email);
        if (existingUser) {
          const patch: Record<string, string | null | undefined> = {};
          const oauthImage = (user as { image?: string | null }).image;
          if (!existingUser.image && oauthImage) patch.image = oauthImage;
          if (!existingUser.name  && user.name)  patch.name  = user.name;
          if (Object.keys(patch).length > 0) {
            await updateUser(existingUser.id, patch);
          }
        }
      }
      return true;
    },
    async jwt({ token, user, trigger }) {
      const email = user?.email ?? (token.email as string | undefined);
      const userId = user?.id ?? (token.id as string | undefined);

      // Only refresh from the DB on sign-in or an explicit session.update().
      // Every other request reuses the cached token — otherwise every
      // Node-runtime hit costs getUserById + countActiveProjects (+ a possible
      // updateUser from heal), turning a 1-user app into a per-request DB
      // amplifier when traffic scales. The places that actually need fresh
      // state (post-onboarding finish, /onboarding mount) all call update()
      // explicitly, so this is correctness-preserving.
      if (!user?.id && trigger !== "update") return token;

      let dbUser = userId && isValidUuid(userId) ? await getUserById(userId) : null;
      if (!dbUser && email) {
        dbUser = await getUserByEmail(email);
      }
      if (dbUser) {
        dbUser = await healReturningUserOnboarding(dbUser);
        token.id = dbUser.id;
        token.email = dbUser.email ?? email ?? null;
        token.username = dbUser.username ?? null;
        token.onboardedAt = dbUser.onboardedAt ?? null;
        token.onboardingComplete = onboardingCompleteFlag(dbUser);
      } else if (email) {
        token.email = email;
      }
      return token;
    },
    session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: (token.id as string) ?? "",
          username: (token.username as string | null) ?? null,
          onboardedAt: (token.onboardedAt as Date | null) ?? null,
          onboardingComplete: token.onboardingComplete === true,
        },
      };
    },
  },
});
