"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteJson } from "@/lib/api/fetch";

type PinStatus = { configured: boolean; unlocked: boolean };

export function usePrivateZone() {
  const router = useRouter();
  const [status, setStatus] = useState<PinStatus>({ configured: false, unlocked: true });

  useEffect(() => {
    fetch("/api/auth/pin")
      .then((r) => r.json())
      .then((d: PinStatus) => setStatus(d))
      .catch(() => {});
  }, []);

  const lock = useCallback(async () => {
    await deleteJson("/api/auth/pin").catch(() => {});
    setStatus((s) => ({ ...s, unlocked: false }));
    router.refresh();
  }, [router]);

  return {
    unlocked: !status.configured || status.unlocked,
    checking: false,
    unlock: () => router.refresh(),
    lock,
    configured: status.configured,
  };
}
