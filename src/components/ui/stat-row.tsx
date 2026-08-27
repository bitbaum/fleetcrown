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
 * room to breathe. Unchanged from `sm` up, where the desktop layout was fine.
 *
 * The odd card out spans the row rather than sitting half-width beside a gap:
 * `:last-child:nth-child(odd)` matches only when the total is odd, so three
 * cards give 2 + 1-wide and four give 2 + 2 with no rule change per page.
 *
 * Extracted after the same pattern was duplicated 4× across pages, in
 * the same iteration the ScrollAffordance refactor (0429728) paid off
 * one commit later — both consolidate proven UI primitives so the 5th
 * occurrence is a one-line wrap.
 */
export function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="ui-stat-row">{children}</div>;
}
