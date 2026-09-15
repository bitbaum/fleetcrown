import type { TerminalSource } from "@/config/terminal-modes";

/**
 * Which terminal source a page load should open.
 *
 * Extracted from TerminalSurface so the rule can be asserted. The rule exists
 * because of a real dead end: a "Watch" link on Control carries `?project=X`
 * and no source, so the source fell back to `mode.source` — remembered in
 * localStorage. Anyone who had once chosen Shell was then sent to a plain bash
 * PTY by every watch link on the page, while the agent they clicked to see ran
 * on elsewhere. Nothing looked broken; the terminal just opened the wrong
 * thing, permanently, for that browser.
 *
 * A shell has no project tabs at all, so `?project=` + shell is never what the
 * link meant. An explicit `?source=shell` is still obeyed: that is the reader
 * asking, not a stale preference answering for them.
 */
export function resolveTerminalSource({
  fromUrl,
  remembered,
  projectRequested,
  available,
}: {
  /** `?source=` on the deep link, if any. */
  fromUrl?: TerminalSource;
  /** The source remembered for this browser. */
  remembered: TerminalSource;
  /** Whether the deep link named a project/tab. */
  projectRequested: boolean;
  /** Sources this deployment can actually offer. */
  available: readonly TerminalSource[];
}): TerminalSource {
  const wanted = fromUrl ?? remembered;
  if (!projectRequested || fromUrl || wanted !== "shell") return wanted;
  return available.find((candidate) => candidate !== "shell") ?? wanted;
}
