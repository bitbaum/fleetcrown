/**
 * Three-up stats row. Wraps children in the canonical grid that the audit
 * settled on so all four call sites — Goals, Memory, Money, Habits — share
 * one source of truth for the layout.
 *
 * Callers own the card shape inside (StatCard for label+value+sub, or
 * Card+CardHeader for icon-led variants). The primitive only owns the
 * column wrapper.
 *
 * `grid-cols-3` unconditionally (all widths) measured at ~120px per card on
 * a 390px phone — three bordered, padded StatCards each holding a 2xl bold
 * number, for stats (Active Goals, Avg Progress, Total) that inform no
 * decision on any of the four pages. Two columns below `sm` gives each card
 * room to breathe; the third simply wraps to its own row rather than being
 * squeezed to fit. Unchanged from `sm` up, where the desktop layout was fine.
 *
 * Extracted after the same pattern was duplicated 4× across pages, in
 * the same iteration the ScrollAffordance refactor (0429728) paid off
 * one commit later — both consolidate proven UI primitives so the 5th
 * occurrence is a one-line wrap.
 */
export function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4">{children}</div>;
}
