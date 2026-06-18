"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, Zap, FolderOpen, FolderKanban, History as HistoryIcon, Mic, MicOff, Loader2, Repeat2 } from "lucide-react";
import { AGENT_LABELS, type AnyAgentId } from "@/lib/agent-labels";
import { useFetch } from "@/hooks/use-fetch";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { NAV_ITEMS, type NavItem } from "@/config/navigation";
import { PROMPT_TEMPLATES, type PromptTemplate } from "@/config/prompt-library";
import type { AgentPrompt } from "@/app/api/prompts/agent/route";
import { cn } from "@/lib/utils";

type PaletteEntry =
  | { kind: "agent-prompt";   key: string; label: string; sub: string; icon: string; href: string }
  | { kind: "prompt-template"; key: string; label: string; sub: string; icon: null;   href: string }
  | { kind: "nav";             key: string; label: string; sub: string; icon: null;   href: string }
  | { kind: "project";         key: string; label: string; sub: string; icon: null;   href: string }
  | { kind: "switch-agent";   key: string; label: string; sub: string; icon: null;   href: string }
  // Composer (Loki Phase 1): run a natural-language command, and the project
  // picker shown when the command is project-ambiguous ("ask when ambiguous").
  | { kind: "run-command";    key: string; label: string; sub: string; icon: null;   href: null }
  | { kind: "pick-project";   key: string; label: string; sub: string; icon: null;   href: null; projectName: string };

const SWITCHABLE_AGENT_IDS = ["claude", "cursor", "codex", "gemini", "grok"] as const satisfies readonly AnyAgentId[];

type UserProjectLite = { id: string; name: string; dirPath?: string | null; isActive?: boolean };

const RECENT_KEY = "fleetcrown.palette.recent";
const RECENT_KEY_LEGACY = "cockpit.palette.recent";
const RECENT_LIMIT = 6;

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  // Composer state (Loki Phase 1): busy = resolving/dispatching; pending = a
  // command whose project we still need to ask for; note = inline status/error.
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ prompt: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Global Escape: closes the palette regardless of where focus is. The
  // input's own onKeyDown already handles Escape when focused, but that
  // breaks the moment focus moves to the mic button, a result row, or
  // anywhere else — the user's "Escape doesn't close" complaint.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const { data: agentPrompts } = useFetch<AgentPrompt[]>(open ? "/api/prompts/agent" : null);
  // User's projects appear in the palette so Cmd-K → typing the project name
  // jumps straight to /control with that project focused. Only fetched while
  // the palette is open (saves one network round-trip per page load).
  const { data: projects } = useFetch<UserProjectLite[]>(open ? "/api/user-projects" : null);

  const onTranscript = useCallback((text: string) => {
    setQuery(text);
    setHighlight(0);
    inputRef.current?.focus();
  }, []);
  const voice = useVoiceInput({ onTranscript });

  // Active project names — the candidate set the resolver matches against.
  const projectNames = useMemo(
    () => (projects ?? []).filter((p) => p.isActive !== false && p.name).map((p) => p.name),
    [projects],
  );

  // Fire-and-forget the resolved instruction into the project's agent session
  // (George's call: dispatch goes to the existing session, not a new one).
  const dispatchInject = useCallback(async (projectKey: string, prompt: string) => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/inject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab: projectKey, customPrompt: prompt }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setNote(b.error ?? `Dispatch failed (HTTP ${res.status})`);
        return;
      }
      setPending(null);
      setQuery("");
      setOpen(false);
    } catch {
      setNote("Dispatch failed — check the runner is connected.");
    } finally {
      setBusy(false);
    }
  }, [setOpen]);

  // Resolve NL → { project, prompt }. If the project is ambiguous, switch to a
  // project picker instead of guessing ("ask when ambiguous").
  const resolveAndRun = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/command/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, projects: projectNames }),
      });
      const r = (await res.json().catch(() => ({}))) as {
        projectKey?: string | null; prompt?: string; needsProject?: boolean; error?: string;
      };
      if (!res.ok) {
        setNote(r.error ?? "Couldn't understand that command.");
        return;
      }
      const prompt = r.prompt?.trim() || text.trim();
      if (r.needsProject || !r.projectKey) {
        setPending({ prompt });
        setQuery("");
        setHighlight(0);
        return;
      }
      await dispatchInject(r.projectKey, prompt);
    } catch {
      setNote("Couldn't reach the resolver.");
    } finally {
      setBusy(false);
    }
  }, [projectNames, dispatchInject]);

  // Hydrate recent on first open so the order survives across sessions.
  useEffect(() => {
    if (!open) return;
    try {
      // Migration: read fleetcrown.* first; fall back to the legacy
      // cockpit.* key so existing users don't lose their recents after the
      // 2026-06 rebrand. The next pushRecent writes under the new key, so
      // the legacy entry stops being read once the user picks anything.
      const raw =
        window.sessionStorage.getItem(RECENT_KEY) ??
        window.sessionStorage.getItem(RECENT_KEY_LEGACY);
      if (raw) setRecent(JSON.parse(raw) as string[]); // eslint-disable-line react-hooks/set-state-in-effect
    } catch { /* ignore */ }
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery(""); // eslint-disable-line react-hooks/set-state-in-effect
      setHighlight(0);
      setPending(null);
      setNote(null);
      setBusy(false);
      // Defer focus to after the modal mounts so the keystroke that opened
      // us doesn't immediately type into the input.
      const t = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const entries = useMemo<PaletteEntry[]>(() => {
    const agent = (agentPrompts ?? [])
      .filter((p) => p.style !== "internal")
      .map<PaletteEntry>((p) => ({
        kind: "agent-prompt",
        key: `agent:${p.key}`,
        label: p.label,
        sub: `Agent · ${p.category}`,
        icon: p.icon,
        href: `/control?prompt=${encodeURIComponent(p.key)}`,
      }));
    const templates = PROMPT_TEMPLATES.map<PaletteEntry>((t: PromptTemplate) => ({
      kind: "prompt-template",
      key: `template:${t.id}`,
      label: t.name,
      sub: `Template · ${t.category}`,
      icon: null,
      href: `/prompts?template=${encodeURIComponent(t.id)}`,
    }));
    const nav = NAV_ITEMS.filter((n) => n.active).map<PaletteEntry>((n: NavItem) => ({
      kind: "nav",
      key: `nav:${n.id}`,
      label: n.label,
      sub: `Go to · ${n.description}`,
      icon: null,
      href: n.href,
    }));
    // Projects come right after navigation because the most-common Cmd-K
    // intent in a fleet-management product is "jump to project X". The href
    // uses /control?focus=<tab> which the ControlPanel deep-link handler
    // picks up (existing behavior from v0.6 push notification flow).
    const projectEntries = (projects ?? [])
      .filter((p) => p.isActive !== false && p.name)
      .map<PaletteEntry>((p) => ({
        kind: "project",
        key: `project:${p.id}`,
        label: p.name,
        sub: `Project · ${p.dirPath ?? "no local path"}`,
        icon: null,
        href: `/control?focus=${encodeURIComponent(p.name)}`,
      }));
    const switchEntries = (projects ?? [])
      .filter((p) => p.isActive !== false && p.name && p.dirPath)
      .flatMap((p) =>
        SWITCHABLE_AGENT_IDS.map<PaletteEntry>((agentId) => ({
          kind: "switch-agent",
          key: `switch:${p.id}:${agentId}`,
          label: `Switch ${p.name} to ${AGENT_LABELS[agentId]}`,
          sub: `Agent · quits current CLI and launches ${AGENT_LABELS[agentId]}`,
          icon: null,
          href: `/control?focus=${encodeURIComponent(p.name)}&switchTo=${encodeURIComponent(agentId)}`,
        })),
      );
    return [...projectEntries, ...switchEntries, ...nav, ...agent, ...templates];
  }, [agentPrompts, projects]);

  const filtered = useMemo<PaletteEntry[]>(() => {
    const q = query.trim().toLowerCase();
    // Project-picker mode: command resolved but project ambiguous — pick one.
    if (pending) {
      return projectNames
        .filter((name) => !q || name.toLowerCase().includes(q))
        .map<PaletteEntry>((name) => ({
          kind: "pick-project", key: `pick:${name}`, label: name,
          sub: "Run the command here", icon: null, href: null, projectName: name,
        }))
        .slice(0, 60);
    }
    // A free-text query is a candidate command — offer it as the top action,
    // above any matching navigate/prompt entries.
    const runRow: PaletteEntry[] = query.trim()
      ? [{ kind: "run-command", key: "__run__", label: `Run: ${query.trim()}`, sub: "Resolve in natural language & dispatch", icon: null, href: null }]
      : [];
    if (!q) {
      // Default ordering: recents (in order) → nav → agent → templates.
      const byKey = new Map(entries.map((e) => [e.key, e]));
      const recentEntries = recent.map((k) => byKey.get(k)).filter(Boolean) as PaletteEntry[];
      const remaining = entries.filter((e) => !recent.includes(e.key));
      return [...recentEntries, ...remaining].slice(0, 60);
    }
    const matches = entries
      .filter((e) => e.label.toLowerCase().includes(q) || e.sub.toLowerCase().includes(q) || e.key.toLowerCase().includes(q))
      .slice(0, 59);
    return [...runRow, ...matches];
  }, [entries, query, recent, pending, projectNames]);

  // Clamp the highlight at render time — avoids setState-in-effect when the
  // filtered range shrinks beneath the stored cursor.
  const safeHighlight = filtered.length === 0 ? 0 : Math.min(highlight, filtered.length - 1);

  const onSelect = (entry: PaletteEntry) => {
    if (entry.kind === "run-command") { void resolveAndRun(query); return; }
    if (entry.kind === "pick-project") { if (pending) void dispatchInject(entry.projectName, pending.prompt); return; }
    if (!entry.href) return;
    pushRecent(entry.key, setRecent);
    setOpen(false);
    router.push(entry.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight(Math.min(filtered.length - 1, safeHighlight + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight(Math.max(0, safeHighlight - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = filtered[safeHighlight];
      if (entry) onSelect(entry);
    } else if (e.key === "Escape") {
      e.preventDefault();
      // Back out of the project picker first, rather than closing the palette.
      if (pending) { setPending(null); setNote(null); } else setOpen(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center"
      // Click-outside-to-close: contains() handles the case where the
      // backdrop div (sibling of the panel) is the click target. The old
      // `target === currentTarget` check failed any click that landed on
      // the backdrop element itself — i.e., most "click outside the panel"
      // attempts — which is the user's "menu doesn't close" complaint.
      onMouseDown={(e) => {
        if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
      }}
    >
      <div className="ui-palette-backdrop" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="ui-palette-panel"
      >
        <div className="ui-palette-input-row">
          <Search className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              voice.status === "recording" ? "Listening…"
              : pending ? "Pick a project (type to filter)…"
              : "Type a command (e.g. “code review for kivvi”) or search…"
            }
            className="ui-palette-input"
            spellCheck={false}
            autoComplete="off"
            disabled={voice.status === "transcribing" || busy}
          />
          {voice.isSupported && (
            <button
              type="button"
              onClick={voice.status === "recording" ? voice.stop : () => voice.start()}
              disabled={voice.status === "transcribing"}
              className={cn(
                "ui-palette-mic",
                voice.status === "recording" && "ui-palette-mic-active",
              )}
              aria-label={voice.status === "recording" ? "Stop recording" : "Voice input"}
              title={voice.status === "recording" ? "Stop" : "Voice (mic)"}
            >
              {voice.status === "transcribing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : voice.status === "recording" ? <MicOff className="h-3.5 w-3.5" />
                : <Mic className="h-3.5 w-3.5" />}
            </button>
          )}
          <kbd className="ui-palette-kbd">esc</kbd>
        </div>
        {voice.error && (
          <div className="ui-palette-voice-error">{voice.error}</div>
        )}
        {(busy || note || pending) && (
          <div className="ui-palette-voice-error">
            {busy ? (<><Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Working…</>)
              : note ? note
              : pending ? `Pick a project to run: “${pending.prompt}”`
              : null}
          </div>
        )}
        <ul className="ui-palette-list" role="listbox">
          {filtered.length === 0 ? (
            <li className="ui-palette-empty">No matches</li>
          ) : (
            filtered.map((entry, i) => (
              <li
                key={entry.key}
                role="option"
                aria-selected={i === safeHighlight}
                className={cn("ui-palette-row", i === safeHighlight && "ui-palette-row-active")}
                onMouseDown={(e) => { e.preventDefault(); onSelect(entry); }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className="ui-palette-row-icon" aria-hidden="true">
                  {entry.kind === "agent-prompt"   && <span className="text-base leading-none">{entry.icon}</span>}
                  {entry.kind === "prompt-template" && <Zap          className="h-3.5 w-3.5" />}
                  {entry.kind === "nav"             && <FolderOpen   className="h-3.5 w-3.5" />}
                  {entry.kind === "project"         && <FolderKanban className="h-3.5 w-3.5" />}
                  {entry.kind === "switch-agent"   && <Repeat2       className="h-3.5 w-3.5" />}
                  {entry.kind === "run-command"     && <Zap          className="h-3.5 w-3.5" />}
                  {entry.kind === "pick-project"    && <FolderKanban className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text-primary">{entry.label}</span>
                  <span className="block truncate text-xs text-text-tertiary">{entry.sub}</span>
                </span>
                {recent.includes(entry.key) && !query && (
                  <span className="ui-palette-row-meta">
                    <HistoryIcon className="h-3 w-3" aria-hidden="true" />
                    recent
                  </span>
                )}
                <ArrowRight className="ui-palette-row-arrow h-3.5 w-3.5" aria-hidden="true" />
              </li>
            ))
          )}
        </ul>
        <div className="ui-palette-foot">
          <span><kbd className="ui-palette-kbd">↑</kbd> <kbd className="ui-palette-kbd">↓</kbd> navigate</span>
          <span><kbd className="ui-palette-kbd">⏎</kbd> open</span>
          <span><kbd className="ui-palette-kbd">⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}

function pushRecent(key: string, setRecent: React.Dispatch<React.SetStateAction<string[]>>) {
  setRecent((prev) => {
    const next = [key, ...prev.filter((k) => k !== key)].slice(0, RECENT_LIMIT);
    try { window.sessionStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
}
