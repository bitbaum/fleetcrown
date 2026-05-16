import { Suspense } from "react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getUserProjects } from "@/db/queries/user-projects";
import { listInvitations } from "@/db/queries/invitations";
import { getUserById } from "@/db/queries/users";
import { ProjectsSettings } from "@/components/settings/ProjectsSettings";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { TeamSettings } from "@/components/settings/TeamSettings";
import { BeaconSettings } from "@/components/settings/BeaconSettings";
import { BillingSettings } from "@/components/settings/BillingSettings";
import { PageLayout } from "@/components/ui/page-layout";
import { isStripeReady } from "@/lib/stripe";
import { getProjectLimit, isUnlimitedProjects } from "@/lib/plan";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const [projects, user, invitations] = await Promise.all([
    getUserProjects(session.user.id),
    getUserById(session.user.id),
    listInvitations(session.user.id),
  ]);

  if (!user) redirect("/sign-in");

  return (
    <PageLayout title="Settings" maxWidth="max-w-2xl">
      <ProfileSettings user={{ id: user.id, name: user.name ?? "", username: user.username ?? "", image: user.image ?? "" }} />
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
        projectLimit={user.isDefault || isUnlimitedProjects(user.plan) ? null : getProjectLimit(user.plan)}
      />
      <TeamSettings invitations={invitations} />
    </PageLayout>
  );
}
