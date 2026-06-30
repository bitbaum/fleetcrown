"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessagesSquare, Plus, SlidersHorizontal } from "lucide-react";
import { getJson, postJson, deleteJson, throwApiError } from "@/lib/api/fetch";
import { resolveLokiProjectSelection } from "@/lib/loki/project-selection";
import { Drawer } from "@/components/ui/modal";
import { ConversationList } from "./ConversationList";
import { Transcript } from "./Transcript";
import { Composer } from "./Composer";
import { ProjectFilter } from "./ProjectFilter";
import type { Attachment, ConversationSummary, LokiMessage, LokiProject, ModelChoice } from "./types";

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
 * Client orchestrator for the Loki 3-pane surface. Owns selection state and
 * the data round-trips; the panes are pure presentation. The project filter is
 * applied client-side over the full conversation list (the server returns all
 * threads; filtering here keeps the list responsive without a refetch).
 */
export function LokiWorkspace({
  initialProjects,
  initialConversations,
  loadErrors,
}: LokiWorkspaceProps = {}) {
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mobile-only slide-overs for the history + project panes (desktop shows them
  // as permanent columns). Keeps the chat full-width on phones.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

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
    window.addEventListener("loki:prefill", handler);
    return () => window.removeEventListener("loki:prefill", handler);
  }, []);

  const reloadProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const rows = await fetchJson<Array<{ id: string; name: string; topGoal?: LokiProject["topGoal"] }>>(
        "/api/user-projects",
      );
      setProjects(rows.map((p) => ({ id: p.id, name: p.name, topGoal: p.topGoal ?? null })));
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
    const fromUrl = resolveLokiProjectSelection(projects, searchParams.get("project"));
    if (fromUrl.length > 0) setSelectedProjects(fromUrl);
    setSelectionInitialized(true);
  }, [projects, projectsLoading, searchParams, selectionInitialized]);

  // Load the active conversation's transcript.
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    getJson<{ messages: LokiMessage[] }>(`/api/conversations/${activeId}`)
      .then((d) => setMessages(d.messages))
      .catch(() => setError("Could not load this conversation."));
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
    opts: { selectedProjectsOverride?: string[]; dispatchOnly?: boolean } = {},
  ) => {
    const scopedProjects = opts.selectedProjectsOverride ?? selectedProjects;
    const dispatchOnly = opts.dispatchOnly ?? false;
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
        // Model picker — omitted keys mean "Auto" (project default).
        ...(choice.agent ? { agent: choice.agent } : {}),
        ...(choice.model ? { model: choice.model } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      if (!res.ok) await throwApiError(res, "Message failed.");
      const { message } = (await res.json()) as { message: LokiMessage };
      setMessages((prev) => [...prev, message]);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 md:grid md:grid-cols-[16rem_1fr] md:gap-4 lg:grid-cols-[16rem_1fr_16rem]">
      {/* LEFT — conversation list (permanent column on md+; a drawer on mobile) */}
      <aside className="ui-panel hidden min-h-0 p-3 md:block">
        <ConversationList
          conversations={visibleConversations}
          activeId={activeId}
          loading={convosLoading}
          error={convosError}
          onRetry={() => void reloadConversations()}
          onSelect={setActiveId}
          onNew={() => void createConversation()}
          onDelete={(id) => void deleteConversation(id)}
        />
      </aside>

      {/* CENTER — the chat itself, always the primary, full-width on mobile */}
      <section className="flex min-h-0 flex-1 flex-col gap-2 md:gap-3">
        {/* Mobile-only toolbar: reach the history + project panes without
            stealing chat width. Hidden on md+ where they're permanent columns. */}
        <div className="flex items-center gap-2 md:hidden">
          <button type="button" className="ui-btn-chip" onClick={() => setHistoryOpen(true)}>
            <MessagesSquare className="h-4 w-4" /> Chats
          </button>
          <button type="button" className="ui-btn-chip" onClick={() => void createConversation()}>
            <Plus className="h-4 w-4" /> New
          </button>
          <button type="button" className="ui-btn-chip ml-auto" onClick={() => setFilterOpen(true)}>
            <SlidersHorizontal className="h-4 w-4" />
            Projects{selectedProjects.length > 0 ? ` · ${selectedProjects.length}` : ""}
          </button>
        </div>

        <div className="ui-panel flex min-h-0 flex-1 flex-col px-3 py-2 md:px-4 md:py-3">
          <Transcript
            messages={messages}
            sending={sending}
            onPickProject={dispatchWithProject}
          />
        </div>
        {error && <p className="ui-error">{error}</p>}
        <Composer
          key={composerPrefill ?? "default"}
          defaultText={composerPrefill ?? ""}
          scopedProject={selectedProjects[0] ?? null}
          disabled={false}
          sending={sending}
          onSend={(t, choice, attachments) => void send(t, choice, attachments)}
        />
      </section>

      {/* RIGHT — project multi-select (permanent column on lg+; a drawer on mobile) */}
      <aside className="ui-panel hidden min-h-0 p-3 lg:block">
        <ProjectFilter
          projects={projects}
          selected={selectedProjects}
          loading={projectsLoading}
          error={projectsError}
          onRetry={() => void reloadProjects()}
          onToggle={toggleProject}
        />
      </aside>

      {/* Mobile slide-overs */}
      {historyOpen && (
        <Drawer onClose={() => setHistoryOpen(false)} size="md">
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <ConversationList
              conversations={visibleConversations}
              activeId={activeId}
              loading={convosLoading}
              error={convosError}
              onRetry={() => void reloadConversations()}
              onSelect={(id) => { setActiveId(id); setHistoryOpen(false); }}
              onNew={() => { void createConversation(); setHistoryOpen(false); }}
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
            />
          </div>
        </Drawer>
      )}
    </div>
  );
}
