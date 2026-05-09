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
      <label className="ui-kicker mb-1.5 block">
        {label}
        {required && <span className="text-status-negative"> *</span>}
      </label>
      {children}
    </div>
  );
}
