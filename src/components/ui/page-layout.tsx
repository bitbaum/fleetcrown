import { cn } from "@/lib/utils";

export function PageLayout({
  title,
  subtitle,
  maxWidth = "max-w-4xl",
  children,
}: {
  title: string;
  subtitle?: string;
  maxWidth?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("p-4 md:p-8 mx-auto space-y-6", maxWidth)}>
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm md:text-base text-white/40 mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
