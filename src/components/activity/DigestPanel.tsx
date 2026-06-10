"use client";

import { useState } from "react";
import { Sparkles, RefreshCw, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MarkdownText } from "@/components/ui/markdown-text";

type DigestResponse = {
  markdown: string;
  model: string;
  generatedAt: string;
  cached: boolean;
};

// Reader-friendly summary of the current window/project. Stays off-screen
// until the user asks for it — generating is cheap but not free, and most
// page loads (scrolls, filter clicks) shouldn't burn an LLM call.
export function DigestPanel({ window, project }: { window: string; project: string | null }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DigestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate(force: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/activity/digest${force ? "?force=1" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ window, project }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setResult(data as DigestResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setLoading(false);
    }
  }

  if (!result && !error) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-accent-primary" />
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Report</h2>
            <p className="text-xs text-text-tertiary">
              Reader-friendly summary of what your fleet is doing in this window.
              {project && <> · scoped to <strong className="text-text-secondary">{project}</strong></>}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => generate(false)}
          disabled={loading}
          className="ui-btn-primary"
        >
          {loading ? "Generating…" : "Generate report"}
        </button>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent-primary" />
          <h2 className="text-sm font-semibold text-text-primary">Report</h2>
          {result?.cached && <span className="ui-kicker text-text-tertiary">cached</span>}
        </div>
        <button
          type="button"
          onClick={() => generate(true)}
          disabled={loading}
          className="ui-btn-ghost inline-flex items-center gap-1 text-xs"
        >
          <RefreshCw className={"h-3 w-3" + (loading ? " animate-spin" : "")} />
          {loading ? "Regenerating…" : "Regenerate"}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-status-negative text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <>
          <MarkdownText text={result.markdown} />
          <p className="text-xs text-text-tertiary">
            {new Date(result.generatedAt).toLocaleString()} · {result.model}
          </p>
        </>
      )}
    </Card>
  );
}
