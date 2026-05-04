export const FIELD_INPUT_CLASS =
  "ui-input";

export const PRIMARY_BUTTON_CLASS =
  "flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-primary px-4 py-3 text-sm font-medium text-text-inverted transition-colors hover:bg-accent-hover disabled:opacity-40";

export const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-border-default bg-surface-overlay px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary disabled:opacity-40";

export const DANGER_BUTTON_CLASS =
  "ui-btn-danger inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40";

export const ICON_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:opacity-40";

export const INLINE_SAVE_CLASS =
  "flex items-center gap-1 px-2.5 py-1.5 rounded bg-accent-primary/80 hover:bg-accent-primary disabled:opacity-40 text-text-inverted text-xs font-medium transition-colors";

export const ADD_BUTTON_CLASS =
  "flex items-center gap-1.5 text-xs text-text-muted hover:text-accent-text transition-colors";

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
      <label className="text-[11px] uppercase tracking-wider text-text-tertiary font-medium mb-1.5 block">
        {label}
        {required && <span className="text-status-negative"> *</span>}
      </label>
      {children}
    </div>
  );
}
