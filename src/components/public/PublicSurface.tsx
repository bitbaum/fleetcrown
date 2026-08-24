import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/shell/BrandMark";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";

export type NavLink = { label: string; href: string };

export function PublicSurface({
  children,
  right,
  homeHref = "/",
  showNav = true,
}: {
  children: ReactNode;
  right?: ReactNode;
  homeHref?: string;
  /** Render the Product/Company mega-menu in the header. Default true; the
      auth pages flip this off so the marketing nav doesn't crowd sign-in. */
  showNav?: boolean;
}) {
  return (
    // Tokens (bg-background, text-*) follow next-themes on <html>. Do not pin
    // `.dark` here — that forced public/auth pages to ignore Light/Auto while
    // the signed-in app honored THEME_OPTIONS. ThemeToggle lives in the nav.
    <div className="ui-public-surface">
      <div aria-hidden className="ui-public-backdrop" />
      <nav className="ui-public-nav">
        <div className="ui-public-nav-brand-row">
          <Link href={homeHref} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-border-interactive">
            <BrandMark />
          </Link>
          {showNav && <PublicNav />}
        </div>
        <div className="flex items-center gap-2">
          {right}
        </div>
      </nav>

      {children}

      <PublicFooter />
    </div>
  );
}
