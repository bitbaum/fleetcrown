import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/shell/BrandMark";

export type NavLink = { label: string; href: string };

export function PublicSurface({
  children,
  navLinks,
  right,
  homeHref = "/",
}: {
  children: ReactNode;
  navLinks?: NavLink[];
  right?: ReactNode;
  homeHref?: string;
}) {
  return (
    <div className="ui-public-surface">
      <div aria-hidden className="ui-public-backdrop" />
      <nav className="ui-public-nav">
        <div className="flex items-center gap-8">
          <Link href={homeHref} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-white/40">
            <BrandMark inverted />
          </Link>
          {navLinks && navLinks.length > 0 && (
            <div className="hidden items-center md:flex">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href} className="ui-public-nav-link">
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {right}
        </div>
      </nav>

      {children}
    </div>
  );
}
