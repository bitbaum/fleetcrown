"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { BeaconSession } from "@/app/api/beacon/route";
import { BeaconPageClient } from "@/app/beacon/[id]/BeaconClient";

export function BeaconLiveClient({ initialSession = null }: { initialSession?: BeaconSession | null }) {
  const [session, setSession] = useState<BeaconSession | null>(initialSession);
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
        setTimeout(connect, 2000);
      };
    }

    connect();
    return () => esRef.current?.close();
  }, []);

  const handleClose = () => {
    setTimeout(() => setSession(null), 1500);
  };

  if (!session) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-surface-base select-none">
        <Image src="/icon.svg" alt="Cockpit" width={48} height={48} className="opacity-40" />
        <p className="text-xs text-text-muted tracking-widest uppercase">Standby</p>
      </div>
    );
  }

  return <BeaconPageClient initialSession={session} onClose={handleClose} />;
}
