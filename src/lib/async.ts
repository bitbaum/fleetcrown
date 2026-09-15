/**
 * Tiny async primitives with no dependencies, so anything that bundles `src/`
 * (the app, and desktop/src/main via its `@/*` path) can import them without
 * dragging a module graph along.
 *
 * `bridge/` deliberately keeps its own copy: its tsconfig pins `rootDir: src`,
 * so a file outside that root cannot be compiled into it.
 */

/** Resolve after `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
