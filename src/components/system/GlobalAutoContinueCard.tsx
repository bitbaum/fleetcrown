"use client";

import { Pause, Play } from "lucide-react";
import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { FetchErrorState } from "@/components/ui/fetch-error-state";
import { getJson, postJson } from "@/lib/api/fetch";
import { useFetch } from "@/hooks/use-fetch";
import { REFRESH_CADENCE } from "@/config/refresh";

type GlobalAutoContinue = {
  enabled: boolean;
  total: number;
  disabled: number;
};

export function GlobalAutoContinueCard() {
  const { data, loading, error, refetch } = useFetch<GlobalAutoContinue>("/api/control/auto-continue?all=1", {
    intervalMs: REFRESH_CADENCE.system,
    timeoutMs: 10_000,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const setAll = async (enabled: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await postJson("/api/control/auto-continue", { all: true, enabled });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await getJson<GlobalAutoContinue>("/api/control/auto-continue?all=1");
      setMessage(`${enabled ? "Resumed" : "Paused"} ${json.total} project${json.total === 1 ? "" : "s"}.`);
      refetch();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader icon={Pause} title="Global auto-continue" />
        <p className="text-sm text-text-secondary">Loading automation state...</p>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader icon={Pause} title="Global auto-continue" />
        <FetchErrorState message="Couldn't load auto-continue state" detail={error} onRetry={refetch} />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        icon={data.enabled ? Play : Pause}
        title="Global auto-continue"
        right={<span className="text-xs text-text-tertiary">{data.disabled} paused</span>}
      />
      <p className="mb-3 text-sm text-text-secondary">
        {data.enabled ? "Automatic continuation is enabled for all tracked projects." : "At least one project is paused."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="ui-btn-secondary text-sm" disabled={busy} onClick={() => setAll(false)}>
          <Pause className="h-4 w-4" /> Pause all
        </button>
        <button type="button" className="ui-btn-primary text-sm" disabled={busy} onClick={() => setAll(true)}>
          <Play className="h-4 w-4" /> Resume all
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-text-tertiary">{message}</p>}
    </Card>
  );
}
