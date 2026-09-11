/**
 * Single-quote a value for a POSIX shell. The only escaping rule that is
 * always right: close the quote, emit an escaped quote, reopen. Lived in the
 * zellij adapter for historical reasons; every shell-out in the codebase uses
 * it, so it lives on its own.
 */
export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
