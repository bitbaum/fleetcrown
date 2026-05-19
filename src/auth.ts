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

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
      username: string | null;
      onboardedAt: Date | null;
    };
  }
}


export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // Temporary diagnostic — Vercel logs aren't reachable, so persist Auth.js failures
  // to the debug_logs table where they can be queried directly.
  debug: true,
  logger: {
    error: (err) => {
      console.error("[auth.logger.error]", err?.name, err?.message, err);
      // Unwrap nested cause / type-specific fields — Auth.js v5 wraps the real
      // failure under .cause and uses minified class names in prod, so a shallow
      // stringify loses the actionable detail.
      const meta: Record<string, unknown> = {
        name: err?.name,
        type: (err as { type?: string })?.type,
        kind: (err as { kind?: string })?.kind,
        stack: err?.stack?.split("\n").slice(0, 8).join("\n"),
      };
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
          } catch { return String(c); }
        }
        return c;
      };
      if (err?.cause) meta.cause = unwrapCause(err.cause);
      // Fire-and-forget DB write — never block the auth flow.
      db.execute(sql`
        INSERT INTO debug_logs (source, level, message, meta)
        VALUES ('auth', 'error', ${err?.message ?? String(err)}, ${JSON.stringify(meta)}::jsonb)
      `).catch(() => {});
    },
    warn:  (code) => { console.warn("[auth.logger.warn]", code); },
    debug: (code, meta) => { console.log("[auth.logger.debug]", code, meta); },
  },
  events: {
    async signIn(message) {
      db.execute(sql`
        INSERT INTO debug_logs (source, level, message, meta)
        VALUES ('auth', 'event:signIn', 'signed in', ${JSON.stringify({
          provider: message.account?.provider,
          userId: message.user?.id,
          email: message.user?.email,
          isNewUser: message.isNewUser,
        })}::jsonb)
      `).catch(() => {});
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
        if (!supplied) return null;

        const user = await getDefaultUser();
        if (!user) return null;

        // Env var takes priority (quick local dev). Falls back to DB hash (packaged installs).
        const envPassword = process.env.LOCAL_AUTH_PASSWORD;
        const ok = envPassword
          ? supplied === envPassword
          : user.passwordHash
            ? await verifyPassword(supplied, user.passwordHash)
            : false;

        if (!ok) return null;
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
        if (!email || !password) return null;

        const user = await getUserByEmail(email);
        if (!user?.passwordHash) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;
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
        if (!userId || !password) return null;

        const user = await getUserById(userId);
        if (!user?.passwordHash) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email ?? "", name: user.name ?? "" };
      },
    }),
  ],
  pages: {
    signIn: ROUTES.SIGN_IN,
    signOut: ROUTES.SIGN_OUT,
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      console.log("[auth.signIn] called", {
        provider: account?.provider,
        userId: user?.id,
        userEmail: user?.email,
        userName: user?.name,
        hasProfile: !!profile,
        accountType: account?.type,
      });
      try {
        // Update GitHub profile fields on first OAuth link.
        if (account?.provider === "github" && user.email) {
          const existingUser = await getUserByEmail(user.email);
          console.log("[auth.signIn] existingUser lookup", { found: !!existingUser, id: existingUser?.id });
          if (existingUser) {
            const patch: Record<string, string | null | undefined> = {};
            const githubImage = (user as { image?: string | null }).image;
            if (!existingUser.image && githubImage) patch.image = githubImage;
            if (!existingUser.name && user.name)   patch.name  = user.name;
            if (Object.keys(patch).length > 0) {
              await updateUser(existingUser.id, patch);
            }
          }
        }

        // Auto-create a personal org for users who don't have one yet.
        // Runs on every sign-in but is a no-op after the first time.
        if (user.id) {
          const memberCount = await getOrgMembershipCount(user.id);
          console.log("[auth.signIn] membership count", { userId: user.id, count: memberCount });
          if (memberCount === 0) {
            const displayName = user.name ?? user.email?.split("@")[0] ?? "user";
            await createPersonalOrg(user.id, displayName);
          }
        }

        console.log("[auth.signIn] returning true");
        return true;
      } catch (e) {
        console.error("[auth.signIn] THREW", e);
        throw e;
      }
    },
    async jwt({ token, user, trigger }) {
      const userId = user?.id ?? (token.id as string | undefined);
      if (userId && (user?.id || trigger === "update")) {
        token.id = userId;
        const dbUser = await getUserById(userId);
        if (dbUser) {
          token.username = dbUser.username ?? null;
          token.onboardedAt = dbUser.onboardedAt ?? null;
        }
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
        },
      };
    },
  },
});
