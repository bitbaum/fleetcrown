import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { AdapterAccountType } from "next-auth/adapters";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";

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
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    async signIn({ user, account }) {
      // On first-ever GitHub sign-in, absorb the new OAuth identity into the
      // existing default user (is_default=true) so all pre-auth data stays accessible.
      // If this GitHub account is already linked, the normal flow handles it.
      if (account?.provider === "github" && account.providerAccountId) {
        const [existing] = await db
          .select({ userId: accounts.userId })
          .from(accounts)
          .where(and(eq(accounts.provider, account.provider), eq(accounts.providerAccountId, account.providerAccountId)))
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

            // Pre-insert account row so the adapter finds the default user via getUserByAccount.
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
    session({ session, user }) {
      const u = user as typeof user & { username?: string | null; onboardedAt?: Date | null };
      return {
        ...session,
        user: {
          ...session.user,
          id: u.id,
          username: u.username ?? null,
          onboardedAt: u.onboardedAt ?? null,
        },
      };
    },
  },
});
