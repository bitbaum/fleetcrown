"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
      <div className="flex h-screen flex-col items-center justify-center gap-6 bg-surface-base p-8 select-none">
        <Image src="/icon.svg" alt="Cockpit" width={56} height={56} className="opacity-60" />
        <div className="text-center">
          <p className="text-sm font-medium text-text-secondary">No agent session waiting</p>
          <p className="mt-1 text-xs text-text-tertiary">This window will fill in the moment one stops.</p>
        </div>
        <Link href="/control" className="ui-btn-pill-positive">
          Open Control panel <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  return <BeaconPageClient initialSession={session} onClose={handleClose} />;
}
