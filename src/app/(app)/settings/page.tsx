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
import { BeaconSettings } from "@/components/settings/BeaconSettings";
import { PageLayout } from "@/components/ui/page-layout";

export const metadata = { title: "Settings" };

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
    <PageLayout title="Settings" maxWidth="max-w-2xl">
      <ProfileSettings user={{ id: user.id, name: user.name ?? "", username: user.username ?? "", image: user.image ?? "" }} />
      <BeaconSettings />
      <ProjectsSettings projects={projects} />
      <TeamSettings invitations={invitations} />
    </PageLayout>
  );
}
