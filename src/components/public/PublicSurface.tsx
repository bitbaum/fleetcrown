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
    <div className="ui-public-surface">
      <div aria-hidden className="ui-public-backdrop" />
      <nav className="ui-public-nav">
        <div className="flex items-center gap-8">
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
