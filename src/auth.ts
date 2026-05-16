import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
// db required here for DrizzleAdapter — not avoidable
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { verifyPassword } from "@/lib/password";
import { getDefaultUser, getUserById, getUserByEmail, updateUser } from "@/db/queries/users";

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
  // JWT strategy required for Credentials provider to work alongside DB adapter
  session: { strategy: "jwt" },
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      // GitHub verifies email addresses, so linking by email is safe.
      // This lets existing users (e.g. the owner with email+password) link
      // their GitHub account on first OAuth sign-in without a duplicate account.
      allowDangerousEmailAccountLinking: true,
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
    signIn: "/sign-in",
    signOut: "/sign-out",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "github") return true;

      // Update profile fields (name, avatar) when a GitHub account is linked
      // to an existing Cockpit user for the first time. The adapter with
      // allowDangerousEmailAccountLinking handles the actual account linking;
      // we only handle the profile refresh here.
      if (user.email) {
        const existingUser = await getUserByEmail(user.email);
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

      return true;
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
