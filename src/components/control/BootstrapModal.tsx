"use client";

import { useState } from "react";
import { X, Loader2, Sparkles, CheckCircle, XCircle, Copy, Rocket, ArrowLeft } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { postJson } from "@/lib/api/fetch";
import { cn } from "@/lib/utils";

type Step = "describe" | "review" | "creating" | "done";

interface Brief {
  name: string;
  tagline: string;
  targetUser: string;
  coreProblem: string;
  coreFeatures: string[];
  stack: { frontend: string; backend: string; db: string };
  monetization: string;
  launchStrategy: string;
}

interface BootstrapStep {
  step: string;
  ok: boolean;
  detail?: string;
}

interface BootstrapResult {
  tab: string;
  dir: string;
  gitUrl: string;
  dbUrl: string | null;
  steps: BootstrapStep[];
  launchPrompt: string;
}

const DEFAULTS: Brief = {
  name: "",
  tagline: "",
  targetUser: "",
  coreProblem: "",
  coreFeatures: ["", "", ""],
  stack: { frontend: "Next.js 15", backend: "TypeScript", db: "PostgreSQL + Drizzle ORM" },
  monetization: "",
  launchStrategy: "",
};

export function BootstrapModal({
  agentId,
  agentModel,
  onClose,
}: {
  agentId: string;
  agentModel: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("describe");
  const [idea, setIdea] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [brief, setBrief] = useState<Brief>(DEFAULTS);
  const [db, setDb] = useState<"neon" | "none">("neon");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [result, setResult] = useState<BootstrapResult | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState("");
  const [copied, setCopied] = useState(false);

  async function generateBrief() {
    if (!idea.trim() || generating) return;
    setGenerating(true);
    setGenError("");
    try {
      const res = await postJson("/api/project/ai-brief", { description: idea.trim() });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to generate brief");
      const g = body.brief;
      setBrief({
        name: g.name ?? "",
        tagline: g.tagline ?? "",
        targetUser: g.targetUser ?? "",
        coreProblem: g.coreProblem ?? "",
        coreFeatures: Array.isArray(g.coreFeatures) && g.coreFeatures.length > 0 ? g.coreFeatures : ["", "", ""],
        stack: {
          frontend: g.stack?.frontend ?? "Next.js 15",
          backend: g.stack?.backend ?? "TypeScript",
          db: g.stack?.db ?? "PostgreSQL + Drizzle ORM",
        },
        monetization: g.monetization ?? "",
        launchStrategy: g.launchStrategy ?? "",
      });
      setStep("review");
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  async function createProject() {
    if (creating || !brief.name.trim()) return;
    setCreating(true);
    setCreateError("");
    setStep("creating");
    try {
      const res = await postJson("/api/project/bootstrap", {
        name: brief.name,
        tagline: brief.tagline || undefined,
        targetUser: brief.targetUser || undefined,
        coreProblem: brief.coreProblem || undefined,
        coreFeatures: brief.coreFeatures.filter(Boolean),
        stack: brief.stack,
        monetization: brief.monetization || undefined,
        launchStrategy: brief.launchStrategy || undefined,
        db,
        visibility,
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Bootstrap failed");
      setResult(body as BootstrapResult);
      setStep("done");
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Bootstrap failed");
      setStep("review");
    } finally {
      setCreating(false);
    }
  }

  async function launchClaudeCode() {
    if (!result || launching) return;
    setLaunching(true);
    setLaunchError("");
    try {
      const res = await postJson("/api/agent/launch", {
        tab: result.tab,
        dir: result.dir,
        agent: agentId,
        model: agentModel || undefined,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Launch failed");
      onClose();
    } catch (e) {
      setLaunchError(e instanceof Error ? e.message : "Launch failed");
    } finally {
      setLaunching(false);
    }
  }

  async function copyPrompt() {
    if (!result?.launchPrompt) return;
    await navigator.clipboard.writeText(result.launchPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function updateFeature(i: number, val: string) {
    const next = [...brief.coreFeatures];
    next[i] = val;
    setBrief((b) => ({ ...b, coreFeatures: next }));
  }

  const STEP_LABELS: Record<Step, { title: string; sub: string }> = {
    describe: { title: "New project", sub: "Describe your idea — AI fills in the rest" },
    review: { title: "Review brief", sub: "Edit anything before creating" },
    creating: { title: "Creating…", sub: `Setting up ${brief.name}` },
    done: { title: "Ready to launch", sub: brief.name },
  };

  return (
    <Modal onClose={onClose} size="xl">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-text-primary">{STEP_LABELS[step].title}</h3>
          <p className="mt-0.5 text-sm text-text-tertiary">{STEP_LABELS[step].sub}</p>
        </div>
        <button onClick={onClose} className="shrink-0 text-text-muted hover:text-text-primary">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Describe ── */}
      {step === "describe" && (
        <>
          <textarea
            autoFocus
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.metaKey && generateBrief()}
            rows={6}
            placeholder={
              "I'm building a tool that helps freelancers track invoices and get paid faster.\n" +
              "Target: solo devs and designers who forget to follow up.\n" +
              "Simple dashboard, automated reminders, Stripe payments…"
            }
            className="ui-input w-full resize-none leading-relaxed"
          />
          {genError && <p className="ui-error">{genError}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={generateBrief}
              disabled={!idea.trim() || generating}
              className="ui-btn-primary flex-1 gap-1.5"
            >
              {generating ? (
                <Loader2 className="ui-spinner-sm" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {generating ? "Generating brief… (~30s)" : "Generate brief →"}
            </button>
            <button onClick={onClose} className="ui-btn-secondary">Cancel</button>
          </div>
        </>
      )}

      {/* ── Review ── */}
      {step === "review" && (
        <>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="ui-kicker">Project name</p>
                <input
                  autoFocus
                  value={brief.name}
                  onChange={(e) => setBrief((b) => ({ ...b, name: e.target.value }))}
                  className="ui-input w-full"
                  placeholder="my-project"
                />
              </div>
              <div className="space-y-1.5">
                <p className="ui-kicker">Tagline</p>
                <input
                  value={brief.tagline}
                  onChange={(e) => setBrief((b) => ({ ...b, tagline: e.target.value }))}
                  className="ui-input w-full"
                  placeholder="One sentence description"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="ui-kicker">For</p>
                <input
                  value={brief.targetUser}
                  onChange={(e) => setBrief((b) => ({ ...b, targetUser: e.target.value }))}
                  className="ui-input w-full"
                  placeholder="Who is this for?"
                />
              </div>
              <div className="space-y-1.5">
                <p className="ui-kicker">Problem</p>
                <input
                  value={brief.coreProblem}
                  onChange={(e) => setBrief((b) => ({ ...b, coreProblem: e.target.value }))}
                  className="ui-input w-full"
                  placeholder="Pain point in one sentence"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="ui-kicker">Core MVP features</p>
              <div className="space-y-2">
                {brief.coreFeatures.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-center text-xs font-bold text-accent-text">{i + 1}</span>
                    <input
                      value={f}
                      onChange={(e) => updateFeature(i, e.target.value)}
                      className="ui-input flex-1"
                      placeholder={`Feature ${i + 1}`}
                    />
                  </div>
                ))}
                {brief.coreFeatures.length < 7 && (
                  <button
                    type="button"
                    onClick={() => setBrief((b) => ({ ...b, coreFeatures: [...b.coreFeatures, ""] }))}
                    className="ml-6 ui-link-muted"
                  >
                    + Add feature
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="ui-kicker">Stack</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {(["frontend", "backend", "db"] as const).map((key) => (
                  <input
                    key={key}
                    value={brief.stack[key]}
                    onChange={(e) => setBrief((b) => ({ ...b, stack: { ...b.stack, [key]: e.target.value } }))}
                    className="ui-input"
                    placeholder={key}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="ui-kicker">Monetization</p>
                <input
                  value={brief.monetization}
                  onChange={(e) => setBrief((b) => ({ ...b, monetization: e.target.value }))}
                  className="ui-input w-full"
                  placeholder="How it makes money"
                />
              </div>
              <div className="space-y-1.5">
                <p className="ui-kicker">Launch strategy</p>
                <input
                  value={brief.launchStrategy}
                  onChange={(e) => setBrief((b) => ({ ...b, launchStrategy: e.target.value }))}
                  className="ui-input w-full"
                  placeholder="First channel or approach"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="ui-kicker">Database</p>
                <div className="flex gap-2">
                  {(["neon", "none"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setDb(opt)}
                      className={cn(
                        "flex-1 rounded-xl border px-3 py-2 text-sm transition-colors",
                        db === opt
                          ? "border-accent-primary bg-accent-muted text-text-primary"
                          : "border-border-subtle text-text-secondary hover:text-text-primary",
                      )}
                    >
                      {opt === "neon" ? "Neon Postgres" : "None"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="ui-kicker">Visibility</p>
                <div className="flex gap-2">
                  {(["private", "public"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setVisibility(opt)}
                      className={cn(
                        "flex-1 rounded-xl border px-3 py-2 text-sm capitalize transition-colors",
                        visibility === opt
                          ? "border-accent-primary bg-accent-muted text-text-primary"
                          : "border-border-subtle text-text-secondary hover:text-text-primary",
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {createError && <p className="ui-error">{createError}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={createProject}
              disabled={!brief.name.trim()}
              className="ui-btn-primary flex-1 gap-1.5"
            >
              <Rocket className="h-3.5 w-3.5" />
              Create everything →
            </button>
            <button onClick={() => setStep("describe")} className="ui-btn-secondary gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
          </div>
        </>
      )}

      {/* ── Creating ── */}
      {step === "creating" && (
        <div className="flex flex-col items-center gap-4 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-accent-text" />
          <div className="text-center">
            <p className="font-medium text-text-primary">{brief.name}</p>
            <p className="mt-1 text-sm text-text-tertiary">
              GitHub repo · git init · Neon database · Cockpit registration
            </p>
          </div>
        </div>
      )}

      {/* ── Done ── */}
      {step === "done" && result && (
        <>
          <div className="space-y-2">
            {result.steps.map((s) => (
              <div key={s.step} className="flex items-start gap-3">
                {s.ok ? (
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-positive" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary">{s.step}</p>
                  {s.detail && (
                    <p className="mt-0.5 truncate text-xs text-text-tertiary" title={s.detail}>
                      {s.detail}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-border-subtle bg-surface-overlay px-4 py-3 space-y-1">
            {result.gitUrl && (
              <p className="truncate text-sm text-text-secondary" title={result.gitUrl}>
                {result.gitUrl}
              </p>
            )}
            {result.dbUrl && <p className="text-xs text-status-positive">Database connected</p>}
            <p className="truncate text-xs text-text-muted" title={result.dir}>
              {result.dir}
            </p>
          </div>

          {launchError && <p className="ui-error">{launchError}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={launchClaudeCode}
              disabled={launching}
              className="ui-btn-primary flex-1 gap-1.5"
            >
              {launching ? (
                <Loader2 className="ui-spinner-sm" />
              ) : (
                <Rocket className="h-3.5 w-3.5" />
              )}
              Launch Claude Code →
            </button>
            <button onClick={copyPrompt} className="ui-btn-secondary gap-1.5">
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copied!" : "Copy prompt"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
