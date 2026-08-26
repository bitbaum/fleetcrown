import { APP_KICKER, APP_NAME } from "@/config/brand";
import { BRAND_MARK, spiralPathD } from "@/config/brand-mark";

export function BrandMark({
  compact = false,
  showWordmark = true,
  /** Animate the spiral (slow rotation + glow). Default on for the full mark,
   *  off when compact — tiny rotating glyphs read as noise, not brand. */
  animated,
  /** Collapse the kicker and shrink the wordmark below `sm`. The stacked
   *  kicker + 24px wordmark is a desktop lockup: on a 390px phone it wrapped
   *  "PERSONAL SYSTEMS" onto two lines and pushed the public header to 220px —
   *  a quarter of the screen spent on a logo. One line, 17px, same lockup
   *  from `sm` up. */
  responsive = false,
}: {
  compact?: boolean;
  showWordmark?: boolean;
  animated?: boolean;
  responsive?: boolean;
}) {
  const markSize = compact
    ? "ui-brand-mark-compact"
    : responsive
      ? "ui-brand-mark-responsive"
      : "ui-brand-mark-default";
  const spin = animated ?? !compact;

  return (
    <div className="flex items-center gap-3">
      <div className={`ui-brand-mark ${markSize} transition-transform hover:scale-[1.02] active:scale-[0.985]`} aria-hidden>
        {/* Dense Archimedean coil — geometry from the SSOT (src/config/brand-mark.ts).
            Stroked with currentColor so it themes; the same path drives the
            favicon, tray icon, app icon, and OG images. */}
        <svg
          width={compact ? 22 : 24}
          height={compact ? 22 : 24}
          viewBox={`0 0 ${BRAND_MARK.viewBox} ${BRAND_MARK.viewBox}`}
          fill="none"
          className={`ui-brand-spiral ${spin ? "ui-brand-spiral-animated" : ""}`}
        >
          <path
            d={spiralPathD()}
            stroke="currentColor"
            strokeWidth={BRAND_MARK.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {showWordmark && !compact && (
        <div className="min-w-0">
          <p className={responsive ? "ui-kicker hidden sm:block" : "ui-kicker"}>{APP_KICKER}</p>
          <span
            className={`block font-medium tracking-display text-text-primary ${
              responsive ? "text-lg sm:mt-1 sm:text-2xl" : "mt-1 text-2xl"
            }`}
          >
            {APP_NAME}
          </span>
        </div>
      )}
    </div>
  );
}
