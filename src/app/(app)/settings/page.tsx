import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getUserProjects } from "@/db/queries/user-projects";
import { listInvitations } from "@/db/queries/invitations";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ProjectsSettings } from "@/components/settings/ProjectsSettings";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { TeamSettings } from "@/components/settings/TeamSettings";

export const metadata = { title: "Settings — Cockpit" };

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const [projects, user, invitations] = await Promise.all([
    getUserProjects(session.user.id),
    db.query.users.findFirst({ where: eq(users.id, session.user.id) }),
    listInvitations(session.user.id),
  ]);

  if (!user) redirect("/sign-in");

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
      <ProfileSettings user={{ id: user.id, name: user.name ?? "", username: user.username ?? "", image: user.image ?? "" }} />
      <ProjectsSettings projects={projects} />
      <TeamSettings invitations={invitations} />
    </div>
  );
}
