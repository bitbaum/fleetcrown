"use client";

import { useState } from "react";
import { Lock, ShieldCheck, ShieldOff } from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { usePrivateZone } from "@/hooks/use-private-zone";
import { postJson, deleteJson } from "@/lib/api/fetch";

type PinStatus = { configured: boolean; unlocked: boolean };

type Mode = "view" | "set" | "change" | "disable";

const PIN_DIGITS_MIN = 4;
const PIN_DIGITS_MAX = 12;

export function PrivacySettings() {
  const { data, refetch } = useFetch<PinStatus>("/api/auth/pin");
  const { lock } = usePrivateZone();

  const configured = data?.configured ?? false;
  const unlocked = data?.unlocked ?? false;
  const [mode, setMode] = useState<Mode>("view");

  return (
    <div className="space-y-6">
      <div className="ui-settings-section">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Private zone</h2>
          <p className="mt-1 text-sm text-text-tertiary">
            Memory, People, Goals, Habits, Events, and Money sit behind a PIN gate.
            Once you enter the right PIN, the zone stays unlocked for 30 minutes of activity.
          </p>
        </div>

        <div className="space-y-3">
          <StatusRow
            icon={configured ? ShieldCheck : ShieldOff}
            label="PIN protection"
            value={configured ? "Configured" : "Not set"}
            tone={configured ? "positive" : "neutral"}
          />
          {configured && (
            <StatusRow
              icon={unlocked ? Lock : ShieldCheck}
              label="Status right now"
              value={unlocked ? "Unlocked" : "Locked"}
              tone={unlocked ? "warning" : "positive"}
            />
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {!configured && (
            <button type="button" onClick={() => setMode("set")} className="ui-btn-primary">
              Set PIN
            </button>
          )}
          {configured && (
            <>
              <button type="button" onClick={() => setMode("change")} className="ui-btn-secondary">
                Change PIN
              </button>
              {unlocked ? (
                <button type="button" onClick={lock} className="ui-btn-secondary inline-flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Lock now
                </button>
              ) : null}
              <button type="button" onClick={() => setMode("disable")} className="ui-btn-secondary">
                Disable PIN
              </button>
            </>
          )}
        </div>

        {mode === "set" && (
          <SetPinForm
            onCancel={() => setMode("view")}
            onSuccess={() => {
              setMode("view");
              refetch();
            }}
          />
        )}
        {mode === "change" && (
          <ChangePinForm
            onCancel={() => setMode("view")}
            onSuccess={() => {
              setMode("view");
              refetch();
            }}
          />
        )}
        {mode === "disable" && (
          <DisablePinForm
            onCancel={() => setMode("view")}
            onSuccess={() => {
              setMode("view");
              refetch();
            }}
          />
        )}
      </div>

      <div className="ui-settings-section">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Data</h2>
          <p className="mt-1 text-sm text-text-tertiary">
            Your private data — contacts, goals, habits, events, money, and the derived knowledge graph —
            lives on the same database as your account. Export and full-deletion controls are on the roadmap.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusRow({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  tone: "positive" | "warning" | "neutral";
}) {
  const toneClass =
    tone === "positive" ? "text-status-positive" :
    tone === "warning"  ? "text-status-warning"  :
                          "text-text-tertiary";
  return (
    <div className="ui-list-item">
      <div className="flex items-center gap-3">
        <Icon className={`h-4 w-4 shrink-0 ${toneClass}`} />
        <span className="text-sm text-text-secondary">{label}</span>
      </div>
      <span className={`text-sm font-medium ${toneClass}`}>{value}</span>
    </div>
  );
}

// ─── Forms — one per action so each can own its validation + state ──────────

function PinInput({
  value,
  onChange,
  placeholder,
  disabled,
  autoFocus,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  disabled?: boolean;
  autoFocus?: boolean;
  label: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-caps text-text-muted">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]*"
        maxLength={PIN_DIGITS_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className="ui-input w-full text-center text-xl tracking-[0.4em]"
      />
    </label>
  );
}

function SetPinForm({ onCancel, onSuccess }: { onCancel: () => void; onSuccess: () => void }) {
  const [newPin, setNewPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (newPin.length < PIN_DIGITS_MIN) {
      setErr(`PIN must be at least ${PIN_DIGITS_MIN} digits`);
      return;
    }
    if (newPin !== confirm) {
      setErr("PINs don't match");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await postJson("/api/auth/pin/setup", { newPin });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setErr(data.error ?? "Couldn't set PIN");
        return;
      }
      onSuccess();
    } catch {
      setErr("Network error — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="ui-settings-subpanel space-y-3">
      <PinInput label="New PIN" value={newPin} onChange={setNewPin} placeholder="••••" autoFocus />
      <PinInput label="Confirm PIN" value={confirm} onChange={setConfirm} placeholder="••••" />
      {err && <p className="ui-error-xs">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="ui-btn-primary">
          {loading ? "Saving…" : "Save PIN"}
        </button>
        <button type="button" onClick={onCancel} className="ui-btn-secondary">Cancel</button>
      </div>
    </form>
  );
}

function ChangePinForm({ onCancel, onSuccess }: { onCancel: () => void; onSuccess: () => void }) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (newPin.length < PIN_DIGITS_MIN) {
      setErr(`New PIN must be at least ${PIN_DIGITS_MIN} digits`);
      return;
    }
    if (newPin !== confirm) {
      setErr("New PINs don't match");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await postJson("/api/auth/pin/setup", { currentPin, newPin });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setErr(data.error ?? "Couldn't change PIN");
        return;
      }
      onSuccess();
    } catch {
      setErr("Network error — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="ui-settings-subpanel space-y-3">
      <PinInput label="Current PIN" value={currentPin} onChange={setCurrentPin} placeholder="••••" autoFocus />
      <PinInput label="New PIN" value={newPin} onChange={setNewPin} placeholder="••••" />
      <PinInput label="Confirm new PIN" value={confirm} onChange={setConfirm} placeholder="••••" />
      {err && <p className="ui-error-xs">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="ui-btn-primary">
          {loading ? "Saving…" : "Change PIN"}
        </button>
        <button type="button" onClick={onCancel} className="ui-btn-secondary">Cancel</button>
      </div>
    </form>
  );
}

function DisablePinForm({ onCancel, onSuccess }: { onCancel: () => void; onSuccess: () => void }) {
  const [currentPin, setCurrentPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const res = await deleteJson("/api/auth/pin/setup", { currentPin });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setErr(data.error ?? "Couldn't disable PIN");
        return;
      }
      onSuccess();
    } catch {
      setErr("Network error — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="ui-settings-subpanel space-y-3">
      <p className="text-sm text-text-secondary">
        Disabling the PIN removes the gate. Your private data stays in place — it just becomes accessible without entering a PIN.
      </p>
      <PinInput label="Current PIN" value={currentPin} onChange={setCurrentPin} placeholder="••••" autoFocus />
      {err && <p className="ui-error-xs">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="ui-btn-danger">
          {loading ? "Disabling…" : "Disable PIN"}
        </button>
        <button type="button" onClick={onCancel} className="ui-btn-secondary">Cancel</button>
      </div>
    </form>
  );
}
