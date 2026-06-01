import Link from "next/link";
import { auth } from "@/auth";
import { ROUTES } from "@/config/auth";

// Right-side nav content for marketing pages. Adapts to session — when signed
// in, surface a clear "Open Cockpit" entry into the app; when out, the usual
// sign-in / get-started pair. Server-rendered so it cannot be pulled into
// client bundles (which would drag the DB layer along with it).
export async function PublicHeaderActions() {
  const session = await auth();
  const signedIn = Boolean(session?.user);

  if (signedIn) {
    return (
      <Link href={ROUTES.APP_HOME} className="ui-public-primary-action-compact">
        Open Cockpit →
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link href={ROUTES.SIGN_IN} className="ui-public-nav-link hidden sm:block">
        Sign in
      </Link>
      <Link href={ROUTES.SIGN_IN} className="ui-public-primary-action-compact">
        Get started
      </Link>
    </div>
  );
}
