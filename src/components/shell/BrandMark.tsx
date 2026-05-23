import { APP_KICKER, APP_NAME } from "@/config/brand";

export function BrandMark({
  compact = false,
  showWordmark = true,
  inverted = false,
}: {
  compact?: boolean;
  showWordmark?: boolean;
  inverted?: boolean;
}) {
  const markSize = compact ? "ui-brand-mark-compact" : "ui-brand-mark-default";
  const markSurface = inverted ? "ui-brand-mark-inverted" : "ui-brand-mark";

  return (
    <div className="flex items-center gap-3">
      <div className={`${markSurface} ${markSize}`} aria-hidden>
        <svg
          width={compact ? 22 : 24}
          height={compact ? 22 : 24}
          viewBox="0 0 24 24"
          fill="none"
          className={inverted ? "text-white" : "text-text-primary"}
        >
          <rect x="4" y="5" width="16" height="14" rx="4" stroke="currentColor" strokeWidth="1.5" opacity="0.92" />
          <path d="M12 7V17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.88" />
          <path d="M7 12H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.72" />
          <path d="M14 12H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.72" />
          <path d="M8 8.5H16" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity="0.52" />
        </svg>
      </div>
      {showWordmark && !compact && (
        <div className="min-w-0">
          <p className={inverted ? "ui-brand-kicker-inverted" : "ui-kicker"}>{APP_KICKER}</p>
          <span className={inverted ? "ui-brand-wordmark-inverted" : "mt-1 block text-2xl font-medium tracking-display text-text-primary"}>
            {APP_NAME}
          </span>
        </div>
      )}
    </div>
  );
}
