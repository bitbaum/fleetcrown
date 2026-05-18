import { Suspense } from "react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getUserProjects, getOrgProjects } from "@/db/queries/user-projects";
import { listInvitations } from "@/db/queries/invitations";
import { getUserById } from "@/db/queries/users";
import { ProjectsSettings } from "@/components/settings/ProjectsSettings";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { TeamSettings } from "@/components/settings/TeamSettings";
import { AgentTokenSettings } from "@/components/settings/AgentTokenSettings";
import { BeaconSettings } from "@/components/settings/BeaconSettings";
import { BillingSettings } from "@/components/settings/BillingSettings";
import { PageLayout } from "@/components/ui/page-layout";
import { isStripeReady } from "@/lib/stripe";
import { getProjectLimit, isUnlimitedProjects } from "@/lib/plan";
import { ROUTES } from "@/config/auth";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect(ROUTES.SIGN_IN);

  const [projects, teamProjects, user, invitations] = await Promise.all([
    getUserProjects(session.user.id),
    getOrgProjects(session.user.id),
    getUserById(session.user.id),
    listInvitations(session.user.id),
  ]);

  if (!user) redirect(ROUTES.SIGN_IN);

  return (
    <PageLayout title="Settings" maxWidth="max-w-2xl">
      <ProfileSettings user={{ id: user.id, name: user.name ?? "", username: user.username ?? "", image: user.image ?? "", hasPassword: !!user.passwordHash }} />
      <BeaconSettings />
      <Suspense>
        <BillingSettings
          plan={user.plan}
          planStatus={user.planStatus ?? null}
          stripeReady={isStripeReady()}
          hasSubscription={!!user.stripeSubscriptionId}
        />
      </Suspense>
      <ProjectsSettings
        projects={projects}
        teamProjects={teamProjects}
        projectLimit={user.isDefault || isUnlimitedProjects(user.plan) ? null : getProjectLimit(user.plan)}
      />
      <AgentTokenSettings />
      <TeamSettings invitations={invitations} />
    </PageLayout>
  );
}
