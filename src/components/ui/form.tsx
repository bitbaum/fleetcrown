export const FIELD_INPUT_CLASS =
  "ui-input";

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
