import { APP_KICKER, APP_NAME } from "@/config/brand";

export function BrandMark({
  compact = false,
  showWordmark = true,
}: {
  compact?: boolean;
  showWordmark?: boolean;
}) {
  const markSize = compact ? "ui-brand-mark-compact" : "ui-brand-mark-default";

  return (
    <div className="flex items-center gap-3">
      <div className={`ui-brand-mark ${markSize} transition-transform hover:scale-[1.02] active:scale-[0.985]`} aria-hidden>
        <svg
          width={compact ? 22 : 24}
          height={compact ? 22 : 24}
          viewBox="0 0 24 24"
          fill="none"
          className="text-text-primary"
        >
          {/* Spiral mark — three alternating semicircles of growing radius
              (2 → 4 → 6) tracing 1.5 turns outward from center. Two paths so
              the inner arc reads bolder than the outer one (depth trick
              inherited from the previous control-window mark). MUST stay
              pixel-identical with public/icon.svg and every
              opengraph-image.tsx — see comments there. */}
          <path
            d="M 12 14 A 2 2 0 0 1 12 10 A 4 4 0 0 0 12 16"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.95"
          />
          <path
            d="M 12 16 A 6 6 0 0 1 12 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.7"
          />
        </svg>
      </div>
      {showWordmark && !compact && (
        <div className="min-w-0">
          <p className="ui-kicker">{APP_KICKER}</p>
          <span className="mt-1 block text-2xl font-medium tracking-display text-text-primary">
            {APP_NAME}
          </span>
        </div>
      )}
    </div>
  );
}
