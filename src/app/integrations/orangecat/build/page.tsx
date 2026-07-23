import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ROUTES } from "@/config/auth";
import { getUserProjects } from "@/db/queries/user-projects";
import { getOrangeCatLink } from "@/lib/integrations/orangecat-identity";
import { verifyOrangeCatBuildIntent } from "@/lib/integrations/orangecat-build-intent";
import { OrangeCatBuildHandoff } from "@/components/integrations/OrangeCatBuildHandoff";
import { PublicHeaderActions } from "@/components/public/PublicHeaderActions";
import { PublicSurface } from "@/components/public/PublicSurface";

export const metadata = {
  title: "Build from OrangeCat",
  description: "Review an OrangeCat entity and turn it into a supervised FleetCrown project.",
};

export default async function OrangeCatBuildPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const { intent: token } = await searchParams;
  if (!token || token.length > 20_000) {
    return <InvalidHandoff message="This OrangeCat build handoff is missing or invalid." />;
  }

  const session = await auth();
  if (!session?.user?.id) {
    const callback = `/integrations/orangecat/build?intent=${encodeURIComponent(token)}`;
    redirect(`${ROUTES.SIGN_IN}?callbackUrl=${encodeURIComponent(callback)}`);
  }

  let intent;
  try {
    intent = verifyOrangeCatBuildIntent(token);
  } catch (error) {
    return (
      <InvalidHandoff
        message={error instanceof Error ? error.message : "This build handoff is invalid."}
      />
    );
  }

  const link = await getOrangeCatLink(session.user.id);
  if (!link || link.actorId !== intent.sub) {
    return (
      <InvalidHandoff message="Sign in with the OrangeCat account that owns this entity." />
    );
  }

  const projects = await getUserProjects(session.user.id);
  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <main className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <OrangeCatBuildHandoff
          token={token}
          intent={intent}
          projects={projects.map((project) => ({ id: project.id, name: project.name }))}
        />
      </main>
    </PublicSurface>
  );
}

function InvalidHandoff({ message }: { message: string }) {
  return (
    <PublicSurface right={<PublicHeaderActions />}>
      <main className="mx-auto max-w-2xl px-6 py-24 text-center">
        <div className="ui-public-eyebrow">Build handoff</div>
        <h1 className="ui-public-page-title mt-4">This link cannot be used</h1>
        <p className="ui-public-lede mt-5">{message}</p>
        <a href="https://orangecat.ch" className="ui-public-primary-action mt-8">
          Return to OrangeCat
        </a>
      </main>
    </PublicSurface>
  );
}
