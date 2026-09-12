// Can this agent actually run, or is it sitting at a sign-in?
//
// Extracted from poller.ts so the progress heartbeat can ask the same question
// the dispatch path already asks. Importing it back from the poller would be a
// cycle: the poller starts the heartbeat.
import fs from 'fs'
import { claudeProjectSlug } from '@/lib/usage/claude-transcript-usage'

/**
 * Auth canary: after a failed generate-verify, check the newest Claude Code
 * transcript for this dir for a credential failure. Dead box credentials
 * caused two silent fleet outages (2026-07-02/03): every run just timed out
 * with nothing naming the cause. Cheap — one file tail, only on verify failure.
 */
export function detectAuthFailure(dir: string): boolean {
  try {
    // claudeProjectSlug replaces "." as well as "/" — the old inline
    // `replace(/\//g,'-')` silently missed dotted paths, so worktree
    // dispatches (under .claude/worktrees/) never matched their transcript
    // dir and auth failures there were undetectable.
    const projDir = `${process.env.HOME}/.claude/projects/${claudeProjectSlug(dir)}`
    const newest = fs.readdirSync(projDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => ({ f, m: fs.statSync(`${projDir}/${f}`).mtimeMs }))
      .sort((a, b) => b.m - a.m)[0]
    if (!newest) return false
    const tail = fs.readFileSync(`${projDir}/${newest.f}`, 'utf-8').slice(-4000)
    return /401 Invalid authentication|Please run \/login/i.test(tail)
  } catch { return false }
}
