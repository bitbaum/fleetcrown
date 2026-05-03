import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import Image from "next/image";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return { title: `${username} — Cockpit` };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const user = await db.query.users.findFirst({
    where: eq(users.username, username),
  });
  if (!user) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-background text-text-primary">
      <nav className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="text-indigo-400">✦</span> Cockpit
        </Link>
      </nav>

      <main className="mx-auto w-full max-w-2xl px-6 py-12">
        {/* Profile header */}
        <div className="flex items-center gap-4">
          {user.image ? (
            <Image
              src={user.image}
              alt={user.name ?? username}
              width={64}
              height={64}
              className="h-16 w-16 rounded-full"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/20 text-2xl text-indigo-400">
              {(user.name ?? username)[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl font-semibold">{user.name ?? username}</h1>
            <p className="text-sm text-text-secondary">@{username}</p>
          </div>
        </div>

        <p className="mt-10 text-sm text-text-muted">
          This profile is public but no projects have been shared yet.
        </p>
      </main>
    </div>
  );
}
