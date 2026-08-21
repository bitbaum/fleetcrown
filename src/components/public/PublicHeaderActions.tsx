import Link from "next/link";
import { auth } from "@/auth";
import { ROUTES } from "@/config/auth";
import { APP_NAME } from "@/config/brand";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

// Right-side nav content for marketing pages. Adapts to session — when signed
// in, surface a clear "Open {APP_NAME}" entry into the app (uses brand SSOT);
// when out, the usual sign-in / get-started pair. Theme cycle is the same
// THEME_OPTIONS SSOT as the app shell (Light / Dark / Auto). Server-rendered
// shell so it cannot be pulled into client bundles with the DB layer.
export async function PublicHeaderActions() {
  const session = await auth();
  const signedIn = Boolean(session?.user);

  return (
    <div className="flex items-center gap-2">
      <ThemeToggle />
      {signedIn ? (
        <Link href={ROUTES.APP_HOME} className="ui-public-primary-action-compact">
          Open {APP_NAME} →
        </Link>
      ) : (
        <>
          <Link href={ROUTES.SIGN_IN} className="ui-public-nav-link hidden sm:block">
            Sign in
          </Link>
          <Link href={ROUTES.SIGN_UP} className="ui-public-primary-action-compact">
            Get started
          </Link>
        </>
      )}
    </div>
  );
}
