"use client";

import { useState, useRef, useEffect } from "react";
import { usePrivateZone } from "@/hooks/use-private-zone";
import { postJson } from "@/lib/api/fetch";

export function PrivatePinGate({ children }: { children: React.ReactNode }) {
  const { unlocked, checking, unlock } = usePrivateZone();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!checking && !unlocked) {
      inputRef.current?.focus();
    }
  }, [checking, unlocked]);

  if (checking) return null;
  if (unlocked) return <>{children}</>;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin) return;
    setLoading(true);
    setError("");
    try {
      const res = await postJson("/api/auth/pin", { pin });
      const data = await res.json() as { ok: boolean; error?: string; unconfigured?: boolean };
      if (data.ok) {
        unlock();
      } else {
        setError(data.error ?? "Incorrect PIN");
        setPin("");
        inputRef.current?.focus();
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-page flex items-center justify-center">
      <div className="ui-panel w-full max-w-sm p-8">
        <p className="ui-kicker mb-4">Private Zone</p>
        <h1 className="ui-page-title mb-2">Enter PIN</h1>
        <p className="text-text-secondary mb-6 text-sm">
          This section is PIN-protected.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            ref={inputRef}
            type="password"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="ui-input text-center text-xl tracking-widest"
            disabled={loading}
            autoComplete="current-password"
          />
          {error && (
            <p className="ui-error text-center">{error}</p>
          )}
          <button
            type="submit"
            className="ui-btn-primary"
            disabled={loading || !pin}
          >
            {loading ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
