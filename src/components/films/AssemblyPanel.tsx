"use client";

import { useState } from "react";
import { Check, Copy, Film } from "lucide-react";
import { formatRuntime } from "@/config/film";
import { getJson } from "@/lib/api/fetch";
import { useClipboard } from "@/hooks/use-clipboard";
import type { EditList } from "@/lib/film/assembly";

type AssemblyPayload = {
  editList: EditList;
  manifest: string;
  manifestName: string;
  commands: { label: string; command: string }[];
  editListText: string;
  shotSheet: string;
};

/**
 * Putting it back together.
 *
 * Everything here is text the operator runs themselves. Nothing on this panel
 * touches a clip: the files live wherever they put them, and a server that
 * shelled out to ffmpeg over paths a user typed would be a server with a
 * command-injection hole in it.
 */
export function AssemblyPanel({ filmId }: { filmId: string }) {
  const [data, setData] = useState<AssemblyPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getJson<AssemblyPayload>(`/api/films/${filmId}/assembly`));
    } catch {
      setError("Could not build the edit list.");
    } finally {
      setLoading(false);
    }
  };

  if (!data) {
    return (
      <div className="ui-panel space-y-3">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-text-tertiary" aria-hidden />
          <span className="ui-kicker">Assembly</span>
        </div>
        <p className="text-sm text-text-secondary">
          The edit list, the concat manifest and the commands that stitch the clips into one file.
        </p>
        {error && <p className="ui-error">{error}</p>}
        <button type="button" onClick={load} disabled={loading} className="ui-btn-secondary">
          {loading ? "Building…" : "Build the cut"}
        </button>
      </div>
    );
  }

  const { editList } = data;

  return (
    <div className="ui-panel space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="ui-kicker">Assembly</span>
        <span className="text-sm text-text-secondary">
          {editList.readyCount}/{editList.totalCount} shots ·{" "}
          {formatRuntime(editList.plannedRuntimeSeconds)}
        </span>
        <button type="button" onClick={load} className="ui-btn-xs ml-auto">
          Refresh
        </button>
      </div>

      {/* Said plainly, at the top. A rough cut that looks finished is the one
          failure mode of this panel that costs real time. */}
      {!editList.complete && (
        <p className="text-sm text-status-warning">
          {editList.missing.length === editList.totalCount
            ? "No clips yet — nothing to stitch."
            : `Rough cut: ${editList.missing.length} shot${editList.missing.length === 1 ? "" : "s"} still missing (${editList.missing
                .slice(0, 6)
                .map((m) => m.slug)
                .join(", ")}${editList.missing.length > 6 ? "…" : ""}).`}
        </p>
      )}

      <CopyBlock label={`Timeline`} text={data.editListText} />
      <CopyBlock label={`${data.manifestName} — save next to the clips`} text={data.manifest} />

      <div className="space-y-2">
        <span className="ui-kicker">Then run</span>
        {data.commands.map((cmd) => (
          <CopyBlock key={cmd.label} label={cmd.label} text={cmd.command} compact />
        ))}
      </div>

      <CopyBlock label="Every prompt, as one sheet" text={data.shotSheet} />
    </div>
  );
}

function CopyBlock({
  label,
  text,
  compact = false,
}: {
  label: string;
  text: string;
  compact?: boolean;
}) {
  const { copied, copy } = useClipboard();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="ui-micro-label">{label}</span>
        <button
          type="button"
          onClick={() => copy(text)}
          className="ui-btn-xs ml-auto"
          aria-label={`Copy ${label}`}
        >
          {copied ? (
            <Check className="h-3 w-3" aria-hidden />
          ) : (
            <Copy className="h-3 w-3" aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        className={`ui-card-shell overflow-auto whitespace-pre-wrap text-sm text-text-secondary ${
          compact ? "max-h-20" : "max-h-64"
        }`}
      >
        {text}
      </pre>
    </div>
  );
}
