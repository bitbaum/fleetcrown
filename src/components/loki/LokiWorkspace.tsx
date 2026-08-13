"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessagesSquare, Plus } from "lucide-react";
import { getJson, postJson, deleteJson, throwApiError } from "@/lib/api/fetch";
import { resolveLokiProjectSelection } from "@/lib/loki/project-selection";
import { rememberFleetProject } from "@/lib/fleet-context";
import { deriveExecutorHonestyLabel } from "@/lib/executor-honesty";
import { useBuilderPresence } from "@/hooks/use-builder-presence";
import { Drawer } from "@/components/ui/modal";
import { ConversationList } from "./ConversationList";
import { Transcript } from "./Transcript";
import { Composer } from "./Composer";
import { SaveContextBar } from "./SaveContextBar";
import { ProjectFilter } from "./ProjectFilter";
import type { Attachment, ConversationSummary, LokiMessage, LokiProject, ModelChoice } from "./types";
import { LOKI_PREFILL_EVENT } from "@/lib/client-events";

const REFETCH_TIMEOUT_MS = 15_000;

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REFETCH_TIMEOUT_MS);
  try {
    return await getJson<T>(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export type LokiWorkspaceProps = {
  initialProjects?: LokiProject[];
  initialConversations?: ConversationSummary[];
  loadErrors?: { projects?: string | null; conversations?: string | null };
};

/**
 * Client orchestrator for Loki's chat-first surface. History is the only
 * persistent rail; project scope is available on demand from the composer.
 */
export function LokiWorkspace({
  initialProjects,
  initialConversations,
  loadErrors,
}: LokiWorkspaceProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [composerPrefill, setComposerPrefill] = useState<string | null>(null);

  const hasInitialProjects = initialProjects !== undefined;
  const hasInitialConvos = initialConversations !== undefined;

  const [conversations, setConversations] = useState<ConversationSummary[]>(initialConversations ?? []);
  const [convosLoading, setConvosLoading] = useState(!hasInitialConvos);
  const [convosError, setConvosError] = useState<string | null>(loadErrors?.conversations ?? null);

  const [projects, setProjects] = useState<LokiProject[]>(initialProjects ?? []);
  const [projectsLoading, setProjectsLoading] = useState(!hasInitialProjects);
  const [projectsError, setProjectsError] = useState<string | null>(loadErrors?.projects ?? null);

  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [selectionInitialized, setSelectionInitialized] = useState(false);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LokiMessage[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Compact slide-overs keep secondary lists out of the primary chat.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const builderPresence = useBuilderPresence();
  const dispatchHonesty = deriveExecutorHonestyLabel({
    runnerConnected: builderPresence.runnerConnected,
    runtimeAvailable: builderPresence.runtimeAvailable,
  });

  // Initial load — conversations + projects.
  useEffect(() => {
    const q = searchParams.get("q")?.trim();
    if (q) setComposerPrefill(q);
  }, [searchParams]);

  useEffect(() => {
    const handler = (e: Event) => {
      const prompt = (e as CustomEvent<{ prompt: string }>).detail?.prompt ?? "";
      setComposerPrefill(prompt);
    };
    window.addEventListener(LOKI_PREFILL_EVENT, handler);
    return () => window.removeEventListener(LOKI_PREFILL_EVENT, handler);
  }, []);

  const reloadProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const rows = await fetchJson<Array<{ id: string; name: string; entityProjectId?: string | null; topGoal?: LokiProject["topGoal"] }>>(
        "/api/user-projects",
      );
      setProjects(rows.map((p) => ({ id: p.id, name: p.name, entityProjectId: p.entityProjectId ?? null, topGoal: p.topGoal ?? null })));
    } catch {
      setProjectsError("Could not load projects.");
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const reloadConversations = useCallback(async () => {
    setConvosLoading(true);
    setConvosError(null);
    try {
      const data = await fetchJson<{ conversations: ConversationSummary[] }>("/api/conversations");
      setConversations(data.conversations);
    } catch {
      setConvosError("Could not load conversations.");
    } finally {
      setConvosLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasInitialProjects) void reloadProjects();
    if (!hasInitialConvos) void reloadConversations();
  }, [hasInitialConvos, hasInitialProjects, reloadConversations, reloadProjects]);

  useEffect(() => {
    if (selectionInitialized || projectsLoading || projects.length === 0) return;
    // Only honor an explicit ?project= — a fresh /loki visit is the start
    // page (new / open / what needs me). Remembered scope still writes so
    // Control and Terminal keep the last project.
    const requested = searchParams.get("project");
    const fromUrl = resolveLokiProjectSelection(projects, requested);
    if (fromUrl.length > 0) setSelectedProjects(fromUrl);
    setSelectionInitialized(true);
  }, [projects, projectsLoading, searchParams, selectionInitialized]);

  useEffect(() => {
    if (!selectionInitialized) return;
    const project = selectedProjects.length === 1 ? selectedProjects[0] : null;
    rememberFleetProject(project);

    const params = new URLSearchParams(searchParams.toString());
    const current = params.get("project")?.trim() || null;
    if (current === project) return;
    if (project) params.set("project", project);
    else params.delete("project");
    const query = params.toString();
    router.replace(query ? `/loki?${query}` : "/loki", { scroll: false });
  }, [router, searchParams, selectedProjects, selectionInitialized]);

  // Load the active conversation's transcript.
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setTranscriptLoading(false);
      return;
    }
    let current = true;
    setMessages([]);
    setTranscriptLoading(true);
    getJson<{ messages: LokiMessage[] }>(`/api/conversations/${activeId}`)
      .then((d) => {
        if (current) setMessages(d.messages);
      })
      .catch(() => {
        if (current) setError("Could not load this conversation.");
      })
      .finally(() => {
        if (current) setTranscriptLoading(false);
      });
    return () => {
      current = false;
    };
  }, [activeId]);

  // Client-side project filter over the full list (deselect = show all).
  const visibleConversations = useMemo(() => {
    if (selectedProjects.length === 0) return conversations;
    const wanted = new Set(selectedProjects);
    return conversations.filter((c) => c.projectKeys.some((k) => wanted.has(k)));
  }, [conversations, selectedProjects]);

  const createConversation = async (): Promise<string | null> => {
    // Title is omitted — the create route defaults it (SSOT), and the first
    // message auto-titles the thread server-side.
    const res = await postJson("/api/conversations", {
      projectKeys: selectedProjects,
    });
    if (!res.ok) {
      await throwApiError(res, "Could not create conversation.").catch((e: Error) => setError(e.message));
      return null;
    }
    const { conversation } = (await res.json()) as { conversation: ConversationSummary };
    setConversations((prev) => [conversation, ...prev]);
    setActiveId(conversation.id);
    setMessages([]);
    return conversation.id;
  };

  const startNewConversation = () => {
    setActiveId(null);
    setMessages([]);
    setError(null);
    setComposerPrefill(null);
  };

  const deleteConversation = async (id: string) => {
    setError(null);
    const res = await deleteJson(`/api/conversations/${id}`);
    if (!res.ok) {
      await throwApiError(res, "Could not delete conversation.").catch((e: Error) =>
        setError(e.message),
      );
      return;
    }
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
  };

  const send = async (
    text: string,
    choice: ModelChoice = {},
    attachments: Attachment[] = [],
    opts: { selectedProjectsOverride?: string[]; dispatchOnly?: boolean; chatOnly?: boolean } = {},
  ) => {
    const scopedProjects = opts.selectedProjectsOverride ?? selectedProjects;
    const dispatchOnly = opts.dispatchOnly ?? false;
    const chatOnly = opts.chatOnly ?? false;
    setError(null);
    setSending(true);
    // Ensure a thread exists; a fresh page send creates one implicitly.
    const convoId = activeId ?? (await createConversation());
    if (!convoId) {
      setSending(false);
      return;
    }

    // Optimistic user bubble — skip when re-dispatching after a project pick.
    if (!dispatchOnly) {
      const optimistic: LokiMessage = {
        id: `pending-${Date.now()}`,
        conversationId: convoId,
        role: "user",
        kind: null,
        content: text,
        meta: null,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
    }

    try {
      const res = await postJson(`/api/conversations/${convoId}/messages`, {
        text,
        selectedProjects: scopedProjects,
        ...(dispatchOnly ? { dispatchOnly: true } : {}),
        ...(chatOnly ? { chatOnly: true } : {}),
        // Model picker — omitted keys mean "Auto" (project default).
        ...(choice.agent ? { agent: choice.agent } : {}),
        ...(choice.model ? { model: choice.model } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      if (!res.ok) await throwApiError(res, "Message failed.");
      const { message } = (await res.json()) as { message: LokiMessage };
      setMessages((prev) => [...prev, message]);
      const resolvedProjects = message.meta
        ? typeof message.meta.projectKey === "string"
          ? [message.meta.projectKey]
          : Array.isArray(message.meta.projectKeys)
            ? message.meta.projectKeys.filter((value): value is string => typeof value === "string")
            : []
        : [];
      const knownProjects = resolvedProjects.filter((name) => projects.some((project) => project.name === name));
      if (knownProjects.length > 0) setSelectedProjects(knownProjects);
      // Sync the list so the server's auto-title (first message) and recency
      // ordering appear live, not only after a reload.
      void getJson<{ conversations: ConversationSummary[] }>("/api/conversations")
        .then((d) => setConversations(d.conversations))
        .catch(() => { /* keep the existing list on a transient failure */ });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Message failed.");
    } finally {
      setSending(false);
    }
  };

  const dispatchWithProject = (projectName: string, pendingText: string) => {
    if (!activeId || !pendingText.trim()) return;
    setSelectedProjects([projectName]);
    void send(pendingText, {}, [], { selectedProjectsOverride: [projectName], dispatchOnly: true });
  };

  const toggleProject = (name: string) => {
    setSelectedProjects((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name],
    );
  };
  // One-click multi-target — the fast path for "same task → N projects".
  const selectManyProjects = (names: string[]) =>
    setSelectedProjects((prev) => Array.from(new Set([...prev, ...names])));
  const clearProjects = () => setSelectedProjects([]);

  const selectedGoal = selectedProjects.length === 1
    ? projects.find((project) => project.name === selectedProjects[0])?.topGoal ?? null
    : null;

  const isStart =
    messages.length === 0 && !transcriptLoading && !sending && !activeId;

  const chatBody = (
    <>
      <div className={`flex min-h-0 flex-col ${isStart ? "" : "flex-1"} px-1 sm:px-0`}>
        <Transcript
          messages={messages}
          loading={transcriptLoading}
          sending={sending}
          onPickProject={dispatchWithProject}
        />
      </div>
      {messages.length > 0 && (
        <SaveContextBar
          projects={projects}
          messages={messages}
          selectedProject={selectedProjects[0] ?? null}
        />
      )}
      {error && <p className="ui-error">{error}</p>}
      <Composer
        key={`${activeId ?? "new"}:${composerPrefill ?? ""}`}
        defaultText={composerPrefill ?? ""}
        selectedProjects={selectedProjects}
        projectCount={projects.length}
        selectedGoal={selectedGoal}
        onRemoveProject={toggleProject}
        onOpenProjects={() => setFilterOpen(true)}
        disabled={false}
        sending={sending}
        dispatchHonesty={dispatchHonesty}
        onSend={(t, choice, attachments, opts) =>
          void send(t, choice, attachments, { chatOnly: opts?.chatOnly })
        }
      />
    </>
  );

  // History + project-scope slide-overs back the compact toolbar on phones and
  // keep project inventory out of the primary chat on every breakpoint.
  const drawers = (
    <>
      {historyOpen && (
        <Drawer onClose={() => setHistoryOpen(false)} size="md">
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <ConversationList
              conversations={visibleConversations}
              activeId={activeId}
              loading={convosLoading}
              error={convosError}
              onRetry={() => void reloadConversations()}
              onSelect={(id) => {
                const convo = conversations.find((c) => c.id === id);
                if (convo && convo.projectKeys.length > 0) {
                  const known = convo.projectKeys.filter((k) => projects.some((p) => p.name === k));
                  setSelectedProjects(known.length > 0 ? known : convo.projectKeys);
                }
                setActiveId(id);
                setHistoryOpen(false);
              }}
              onNew={() => { startNewConversation(); setHistoryOpen(false); }}
              onDelete={(id) => void deleteConversation(id)}
            />
          </div>
        </Drawer>
      )}
      {filterOpen && (
        <Drawer onClose={() => setFilterOpen(false)} size="md">
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <ProjectFilter
              projects={projects}
              selected={selectedProjects}
              loading={projectsLoading}
              error={projectsError}
              onRetry={() => void reloadProjects()}
              onToggle={toggleProject}
              onSelectMany={selectManyProjects}
              onClear={clearProjects}
            />
          </div>
        </Drawer>
      )}
    </>
  );

  return (
    <div className="ui-loki-workspace">
      <div className="ui-loki-toolbar">
        <button
          type="button"
          className="ui-loki-toolbar-btn"
          onClick={() => setHistoryOpen(true)}
          aria-label={conversations.length > 0 ? `Open chats (${conversations.length})` : "Open chats"}
        >
          <MessagesSquare className="h-4 w-4" />
          <span>Chats</span>
          {conversations.length > 0 && <span className="ui-loki-toolbar-dot" aria-hidden />}
        </button>
        <button
          type="button"
          className="ui-loki-toolbar-btn"
          onClick={startNewConversation}
          aria-label="New chat"
        >
          <Plus className="h-4 w-4" />
          <span>New</span>
        </button>
      </div>

      <section className={isStart ? "ui-loki-stage ui-loki-stage-empty" : "ui-loki-stage ui-loki-stage-chat"}>
        {chatBody}
      </section>

      {drawers}
    </div>
  );
}
