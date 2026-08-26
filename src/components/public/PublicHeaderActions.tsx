import Link from "next/link";
import { auth } from "@/auth";
import { ROUTES } from "@/config/auth";
import { APP_NAME } from "@/config/brand";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { PublicNavTrigger } from "@/components/public/PublicNav";

// Right-side nav content for marketing pages. Adapts to session — when signed
// in, surface a clear "Open {APP_NAME}" entry into the app (uses brand SSOT);
// when out, the usual sign-in / get-started pair. Theme cycle is the same
// THEME_OPTIONS SSOT as the app shell (Light / Dark / Auto). Server-rendered
// shell so it cannot be pulled into client bundles with the DB layer.
//
// It also mounts the phone nav drawer, because it is the one public header
// piece that can read the session: PublicSurface is imported by AuthShell,
// which client pages import, so the shell itself is bundled for the browser
// and cannot call auth().
export async function PublicHeaderActions({
  /** Auth pages pass false — the marketing drawer would crowd sign-in. */
  showMenu = true,
}: {
  showMenu?: boolean;
} = {}) {
  const session = await auth();
  const signedIn = Boolean(session?.user);

  return (
    <div className="flex min-w-0 items-center gap-2">
      {/* Theme cycle and "Sign in" move into the drawer below `md`. Four
          controls (brand, menu, theme, CTA) do not fit a 390px header: the CTA
          was the one that lost, wrapping to two lines and clipping off the
          right edge. */}
      <span className="hidden md:block">
        <ThemeToggle />
      </span>
      {signedIn ? (
        <Link href={ROUTES.APP_HOME} className="ui-public-primary-action-compact">
          {/* "Open FleetCrown →" is ~150px of label. A phone header can spare
              about 90 — so the phone gets the verb and the desktop keeps the
              full brand lockup. */}
          <span className="md:hidden">Open app</span>
          <span className="hidden md:inline">Open {APP_NAME} →</span>
        </Link>
      ) : (
        <>
          <Link href={ROUTES.SIGN_IN} className="ui-public-nav-link hidden md:block">
            Sign in
          </Link>
          <Link href={ROUTES.SIGN_UP} className="ui-public-primary-action-compact">
            Get started
          </Link>
        </>
      )}
      {showMenu && <PublicNavTrigger signedIn={signedIn} />}
    </div>
  );
}
