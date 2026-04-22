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
    <div className={cn("p-4 md:p-8 mx-auto space-y-6", maxWidth)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm md:text-base text-white/40 mt-1">{subtitle}</p>}
        </div>
        {right && <div className="shrink-0 mt-1">{right}</div>}
      </div>
      {children}
    </div>
  );
}
