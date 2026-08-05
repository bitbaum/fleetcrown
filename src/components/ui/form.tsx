export function Field({
  label,
  required = false,
  aiTouched = false,
  children,
}: {
  label: string;
  required?: boolean;
  /** Marks a field the assistant wrote, so an AI edit is never silent. */
  aiTouched?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="ui-kicker mb-1.5 block">
        {label}
        {required && <span className="text-status-negative"> *</span>}
        {aiTouched && <span className="ui-assist-flag">AI</span>}
      </label>
      {children}
    </div>
  );
}
