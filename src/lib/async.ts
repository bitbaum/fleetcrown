/**
 * Tiny async primitives with no dependencies, so anything that bundles `src/`
 * can import them without dragging a module graph along.
 *
 * Two trees deliberately keep their own copy rather than importing this:
 *
 *   bridge/  — its tsconfig pins `rootDir: "src"`, so a file outside that root
 *              cannot be compiled into it at all.
 *   desktop/ — it CAN resolve this (`@/*` → `../src`), but it ships as a
 *              VERSIONED release: every byte changed under desktop/ obliges a
 *              version bump and a published Fleet Runner build, enforced by
 *              scripts/test/desktop-release-drift.ts. Three lines of helper is
 *              not worth asking every machine to update.
 */

/** Resolve after `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
