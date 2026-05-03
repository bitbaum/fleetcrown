import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { AdapterAccountType } from "next-auth/adapters";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { verifyPassword } from "@/lib/password";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string | null;
      onboardedAt: Date | null;
    } & Omit<import("next-auth").DefaultSession["user"], "id">;
  }
}


export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // JWT strategy required for Credentials provider to work alongside DB adapter
  session: { strategy: "jwt" },
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    }),
    Credentials({
      id: "local",
      name: "Local access",
      credentials: {
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const supplied = credentials.password as string | undefined;
        if (!supplied) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.isDefault, true))
          .limit(1);
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
  ],
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "github" && account.providerAccountId) {
        const [existing] = await db
          .select({ userId: accounts.userId })
          .from(accounts)
          .where(and(
            eq(accounts.provider, account.provider),
            eq(accounts.providerAccountId, account.providerAccountId),
          ))
          .limit(1);

        if (!existing) {
          const [defaultUser] = await db
            .select()
            .from(users)
            .where(eq(users.isDefault, true))
            .limit(1);

          if (defaultUser) {
            await db.update(users).set({
              email: user.email ?? defaultUser.email,
              name: user.name ?? defaultUser.name,
              image: (user as { image?: string | null }).image ?? defaultUser.image,
              updatedAt: new Date(),
            }).where(eq(users.id, defaultUser.id));

            await db.insert(accounts).values({
              userId: defaultUser.id,
              type: account.type as AdapterAccountType,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              refresh_token: (account.refresh_token as string | undefined) ?? null,
              access_token: (account.access_token as string | undefined) ?? null,
              expires_at: (account.expires_at as number | undefined) ?? null,
              token_type: account.token_type ?? null,
              scope: account.scope ?? null,
              id_token: (account.id_token as string | undefined) ?? null,
              session_state: (account.session_state as string | undefined) ?? null,
            });
          }
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        const [dbUser] = await db
          .select({ username: users.username, onboardedAt: users.onboardedAt })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);
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
