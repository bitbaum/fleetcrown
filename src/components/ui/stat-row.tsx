/**
 * Three-up stats row. Wraps children in the canonical grid that the audit
 * settled on (grid-cols-3 gap-2 sm:gap-4) so all four call sites — Goals,
 * Memory, Money, Habits — share one source of truth for the layout.
 *
 * Callers own the card shape inside (StatCard for label+value+sub, or
 * Card+CardHeader for icon-led variants). The primitive only owns the
 * three-column wrapper.
 *
 * Extracted after the same pattern was duplicated 4× across pages, in
 * the same iteration the ScrollAffordance refactor (0429728) paid off
 * one commit later — both consolidate proven UI primitives so the 5th
 * occurrence is a one-line wrap.
 */
export function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-2 sm:gap-4">{children}</div>;
}
