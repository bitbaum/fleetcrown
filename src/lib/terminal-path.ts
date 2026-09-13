/**
 * Shortening a working directory for the terminal pane header.
 *
 * Lives in lib rather than beside the component because it is pure logic that
 * has to be tested, and importing the component pulls xterm's stylesheet into
 * the test runner.
 *
 * The first version of this did the shortening in CSS, truncating from the
 * left with `direction: rtl`. That moves the leading separator to the far end:
 * `/home/g` rendered on the page as `home/g/`. A shortened path is fine; a
 * path that is a DIFFERENT path is not — it is the one string on that row an
 * operator might act on, and nothing on screen hints it has been rearranged.
 */
export function shortPath(path: string, home?: string): string {
  let p = path;
  // Only a real home match, never a shared prefix: /home/greg must not become
  // ~reg because the home directory happens to be /home/g.
  if (home && (p === home || p.startsWith(`${home}/`))) p = `~${p.slice(home.length)}`;
  const parts = p.split("/").filter(Boolean);
  if (parts.length <= 3) return p;
  return `…/${parts.slice(-2).join("/")}`;
}
