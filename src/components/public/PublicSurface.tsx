import Link from "next/link";
import type { ReactNode } from "react";
import { CockpitMark } from "@/components/shell/CockpitMark";

export function PublicSurface({
  children,
  right,
  homeHref = "/",
}: {
  children: ReactNode;
  right?: ReactNode;
  homeHref?: string;
}) {
  return (
    <div className="ui-public-surface">
      <div aria-hidden className="ui-public-backdrop" />
      <nav className="ui-public-nav">
        <Link href={homeHref} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-white/40">
          <CockpitMark inverted />
        </Link>
        {right}
      </nav>

      {children}
    </div>
  );
}
