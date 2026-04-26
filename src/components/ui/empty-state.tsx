/**
 * Standard "section is empty" copy used inside Cards / Sections.
 * Same dim styling as the labels around it — sets the tone "this is
 * waiting for content" without screaming for attention.
 *
 *   <EmptyState>No habits tracked yet</EmptyState>
 */
export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-white/30">{children}</div>;
}
