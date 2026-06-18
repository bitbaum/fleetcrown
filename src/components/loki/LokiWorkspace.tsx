"use client";

import { useEffect, useMemo, useState } from "react";
import { getJson, postJson, deleteJson, throwApiError } from "@/lib/api/fetch";
import { ConversationList } from "./ConversationList";
import { Transcript } from "./Transcript";
import { Composer } from "./Composer";
import { ProjectFilter } from "./ProjectFilter";
import type { ConversationSummary, LokiMessage, LokiProject } from "./types";

/**
 * Client orchestrator for the Loki 3-pane surface. Owns selection state and
 * the data round-trips; the panes are pure presentation. The project filter is
 * applied client-side over the full conversation list (the server returns all
 * threads; filtering here keeps the list responsive without a refetch).
 */
export function LokiWorkspace() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [convosLoading, setConvosLoading] = useState(true);
  const [projects, setProjects] = useState<LokiProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LokiMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial load — conversations + projects.
  useEffect(() => {
    getJson<{ conversations: ConversationSummary[] }>("/api/conversations")
      .then((d) => setConversations(d.conversations))
      .catch(() => setError("Could not load conversations."))
      .finally(() => setConvosLoading(false));

    getJson<LokiProject[]>("/api/user-projects")
      .then((d) => setProjects(d.map((p) => ({ id: p.id, name: p.name }))))
      .catch(() => setError("Could not load projects."))
      .finally(() => setProjectsLoading(false));
  }, []);

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

  const send = async (text: string) => {
    setError(null);
    setSending(true);
    // Ensure a thread exists; a fresh page send creates one implicitly.
    const convoId = activeId ?? (await createConversation());
    if (!convoId) {
      setSending(false);
      return;
    }

    // Optimistic user bubble.
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

    try {
      const res = await postJson(`/api/conversations/${convoId}/messages`, {
        text,
        selectedProjects,
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

  const toggleProject = (name: string) => {
    setSelectedProjects((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name],
    );
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[16rem_1fr] gap-4 lg:grid-cols-[16rem_1fr_16rem]">
      {/* LEFT — conversation list */}
      <aside className="ui-panel min-h-0 p-3">
        <ConversationList
          conversations={visibleConversations}
          activeId={activeId}
          loading={convosLoading}
          onSelect={setActiveId}
          onNew={() => void createConversation()}
          onDelete={(id) => void deleteConversation(id)}
        />
      </aside>

      {/* CENTER — transcript + composer */}
      <section className="flex min-h-0 flex-col gap-3">
        <div className="ui-panel flex min-h-0 flex-1 flex-col px-4 py-3">
          <Transcript messages={messages} sending={sending} />
        </div>
        {error && <p className="ui-error">{error}</p>}
        <Composer disabled={false} sending={sending} onSend={(t) => void send(t)} />
      </section>

      {/* RIGHT — project multi-select (hidden below lg to keep the transcript usable) */}
      <aside className="ui-panel hidden min-h-0 p-3 lg:block">
        <ProjectFilter
          projects={projects}
          selected={selectedProjects}
          loading={projectsLoading}
          onToggle={toggleProject}
        />
      </aside>
    </div>
  );
}
