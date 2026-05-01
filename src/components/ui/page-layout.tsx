import { cn } from "@/lib/utils";

export function PageLayout({
  title,
  subtitle,
  right,
  maxWidth = "max-w-4xl",
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  maxWidth?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("app-page space-y-7 md:space-y-9", maxWidth)}>
      <div className="ui-page-header">
        <div>
          <p className="ui-kicker">Cockpit</p>
          <h1 className="ui-page-title mt-2">{title}</h1>
          {subtitle && <p className="ui-page-subtitle">{subtitle}</p>}
        </div>
        {right && <div className="shrink-0 mt-1">{right}</div>}
      </div>
      {children}
    </div>
  );
}
