"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { BeaconSession } from "@/app/api/beacon/route";
import { BeaconPageClient } from "@/app/beacon/[id]/BeaconClient";

export function BeaconLiveClient() {
  const [session, setSession] = useState<BeaconSession | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    function connect() {
      const es = new EventSource("/api/beacon/sse");
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const incoming = JSON.parse(e.data as string) as BeaconSession;
          setSession(incoming);
        } catch { /* ignore malformed */ }
      };

      es.onerror = () => {
        es.close();
        // Reconnect after a brief pause if the connection drops.
        setTimeout(connect, 2000);
      };
    }

    connect();
    return () => esRef.current?.close();
  }, []);

  const handleClose = () => {
    // Show "Dispatched" briefly, then reset to standby.
    setTimeout(() => setSession(null), 1500);
  };

  if (!session) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-surface-page">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
        <p className="text-sm text-text-muted">Waiting for Claude…</p>
      </div>
    );
  }

  return <BeaconPageClient initialSession={session} onClose={handleClose} />;
}
