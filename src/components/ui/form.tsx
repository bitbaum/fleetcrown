/**
 * Shared className for form inputs (input/select/textarea/date) inside
 * the dark modal forms. Keep all the form-row visuals consistent by
 * sourcing this constant rather than copying the long string per call.
 */
export const FIELD_INPUT_CLASS =
  "w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors";

/**
 * Compact variant for inline-edit forms and tight UI rows. Caller appends
 * width/flex modifiers (e.g. `w-full`, `flex-1`) and any extras like
 * `font-mono` or `resize-none`.
 */
export const FIELD_INPUT_CLASS_COMPACT =
  "bg-white/[0.04] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/25";

/**
 * Tight variant for the smallest inline-edit slots (table cells, badges,
 * progress inputs). One step tighter than COMPACT — px-2 py-1.
 */
export const FIELD_INPUT_CLASS_TIGHT =
  "bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/25";

/** Label + child wrapper used by every "New X" form field. */
export function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      {children}
    </div>
  );
}
