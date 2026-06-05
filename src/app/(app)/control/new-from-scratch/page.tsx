"use client";

// "Start a new project from scratch" without local runtime.
// Creates a brand new GitHub repo + FleetCrown project record in one shot.
// After, the user can `git clone` it on any machine — no Fleet Runner needed.
//
// Companion to BootstrapModal which does the full local stack scaffold but
// only works when the local daemon is running.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, GitBranch, Check, Copy } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { TEMPLATES, type TemplateId } from "@/lib/project-templates";

type CreateResponse = {
  ok: boolean;
  project?: { id: string; name: string };
  repo?: {
    name: string;
    full_name: string;
    gitUrl: string;
    sshUrl: string;
    cloneUrl: string;
    private: boolean;
  };
  template?: TemplateId;
  templateSeeded?: boolean;
  cloneCmd?: string;
  cloneHttpsCmd?: string;
  error?: string;
  detail?: string;
  hasGithub?: boolean;
};

export default function NewFromScratchPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [template, setTemplate] = useState<TemplateId>("bare");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateResponse | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"ssh" | "https" | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/projects/create-with-github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          visibility,
          init_readme: true,
          template,
        }),
      });
      const body = (await res.json()) as CreateResponse;
      if (!res.ok || !body.ok) {
        const msg = body.error
          ? body.detail
            ? `${body.error} — ${body.detail}`
            : body.error
          : `Failed (HTTP ${res.status})`;
        setError(msg);
        if (body.hasGithub === false) {
          // No GitHub linked — surface a path to connect.
          setError(`${msg} Go to /control/import to connect GitHub first.`);
        }
        setSubmitting(false);
        return;
      }
      setResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setSubmitting(false);
    }
  }

  async function copy(text: string, kind: "ssh" | "https") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  }

  // ── Result view ─────────────────────────────────────────────────────────

  if (result?.ok && result.repo && result.project) {
    return (
      <PageLayout title="Project created 🎉">
        <div className="space-y-6 max-w-2xl">
          <div>
            <Link href="/control" className="ui-btn-ghost inline-flex items-center gap-1 text-sm">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Control
            </Link>
          </div>

          <div className="ui-card-shell space-y-5 p-6">
            <div>
              <h2 className="ui-page-subtitle">{result.project.name}</h2>
              <p className="text-sm text-text-muted mt-1">
                GitHub repo created ({result.repo.private ? "private" : "public"}) and registered in FleetCrown
                {result.template && result.template !== "bare" && result.templateSeeded && (
                  <> · seeded with the <strong>{TEMPLATES[result.template].label}</strong> starter</>
                )}
                {result.template && result.template !== "bare" && !result.templateSeeded && (
                  <> · template seeding failed (repo is bare with just a README — sorry, run <code className="text-xs">npx create-next-app</code> in your clone)</>
                )}
                .
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-text-primary">
                <GitBranch className="inline h-4 w-4 mr-1 -mt-0.5" />
                Repo
              </div>
              <a
                href={result.repo.gitUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent underline break-all"
              >
                {result.repo.gitUrl}
              </a>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-text-primary">Clone to your machine</div>
              <div className="relative">
                <pre className="ui-card-shell p-3 pr-10 overflow-x-auto text-xs text-text-secondary">
                  <code>{result.cloneCmd}</code>
                </pre>
                <button
                  type="button"
                  onClick={() => copy(result.cloneCmd ?? "", "ssh")}
                  className="absolute top-2 right-2 ui-btn-icon"
                  title="Copy SSH clone command"
                >
                  {copied === "ssh" ? <Check className="h-3.5 w-3.5 text-status-positive" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <details className="text-xs text-text-tertiary">
                <summary className="cursor-pointer">HTTPS clone (no SSH key required)</summary>
                <div className="relative mt-2">
                  <pre className="ui-card-shell p-3 pr-10 overflow-x-auto text-xs text-text-secondary">
                    <code>{result.cloneHttpsCmd}</code>
                  </pre>
                  <button
                    type="button"
                    onClick={() => copy(result.cloneHttpsCmd ?? "", "https")}
                    className="absolute top-2 right-2 ui-btn-icon"
                  >
                    {copied === "https" ? <Check className="h-3.5 w-3.5 text-status-positive" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </details>
            </div>

            <details className="text-xs text-text-tertiary">
              <summary className="cursor-pointer">After cloning — open in editor</summary>
              <p className="mt-2 mb-1 text-text-muted">
                These deeplinks assume you cloned to{" "}
                <code className="px-1 rounded bg-surface-base">~/dev/{result.repo.name}</code> (default).
                The browser will hand the URL to your editor if it&apos;s installed.
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <a
                  href={`cursor://file/${encodeURIComponent("~/dev/" + result.repo.name)}`}
                  className="ui-btn-secondary text-xs"
                >
                  Open in Cursor
                </a>
                <a
                  href={`vscode://file/${encodeURIComponent("~/dev/" + result.repo.name)}`}
                  className="ui-btn-secondary text-xs"
                >
                  Open in VS Code
                </a>
              </div>
            </details>

            <div className="pt-3 border-t border-border-subtle flex justify-end gap-2">
              <button type="button" onClick={() => router.push("/control")} className="ui-btn-secondary">
                Open Control
              </button>
              <button type="button" onClick={() => { setResult(null); setName(""); setDescription(""); }} className="ui-btn-ghost">
                Create another
              </button>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  // ── Form view ───────────────────────────────────────────────────────────

  return (
    <PageLayout title="Start a new project">
      <div className="space-y-6 max-w-2xl">
        <div>
          <Link href="/control" className="ui-btn-ghost inline-flex items-center gap-1 text-sm">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Control
          </Link>
        </div>

        <div className="ui-card-shell space-y-5 p-6">
          <div>
            <h2 className="ui-page-subtitle">Start fresh — GitHub repo + FleetCrown project</h2>
            <p className="text-sm text-text-muted mt-1">
              Creates a brand-new GitHub repo (with README) and registers it as a FleetCrown project.
              No local runtime needed — clone it to your machine when you&apos;re ready.
            </p>
          </div>

          {error && (
            <div className="ui-error p-3 rounded-md text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="catsitting-startup"
                autoFocus
                required
                maxLength={80}
                className="ui-input w-full"
              />
              <p className="text-xs text-text-tertiary mt-1">
                Used as both the GitHub repo name (lowercase, hyphens) and the FleetCrown project display name.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A peer-to-peer marketplace for catsitters."
                maxLength={300}
                rows={2}
                className="ui-input w-full resize-y"
              />
            </div>

            <div>
              <div className="text-sm font-medium text-text-primary mb-1">Visibility</div>
              <div className="flex gap-2">
                <label className="flex items-center gap-2 cursor-pointer flex-1 ui-card-shell p-3">
                  <input
                    type="radio"
                    name="visibility"
                    value="private"
                    checked={visibility === "private"}
                    onChange={() => setVisibility("private")}
                  />
                  <div>
                    <div className="text-sm font-medium">Private</div>
                    <div className="text-xs text-text-muted">Only you can see this repo.</div>
                  </div>
                </label>
                <label className="flex items-center gap-2 cursor-pointer flex-1 ui-card-shell p-3">
                  <input
                    type="radio"
                    name="visibility"
                    value="public"
                    checked={visibility === "public"}
                    onChange={() => setVisibility("public")}
                  />
                  <div>
                    <div className="text-sm font-medium">Public</div>
                    <div className="text-xs text-text-muted">Anyone can find and read it.</div>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-text-primary mb-1">Starter</div>
              <div className="space-y-2">
                {Object.values(TEMPLATES).map((t) => (
                  <label key={t.id} className="flex items-start gap-2 cursor-pointer ui-card-shell p-3">
                    <input
                      type="radio"
                      name="template"
                      value={t.id}
                      checked={template === t.id}
                      onChange={() => setTemplate(t.id)}
                      className="mt-1"
                    />
                    <div>
                      <div className="text-sm font-medium">{t.label}</div>
                      <div className="text-xs text-text-muted">{t.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
              <Link href="/control" className="ui-btn-ghost">Cancel</Link>
              <button
                type="submit"
                disabled={submitting || !name.trim()}
                className="ui-btn-primary inline-flex items-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>Create repo + project</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </PageLayout>
  );
}
