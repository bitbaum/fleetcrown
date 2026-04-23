"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Lightbulb, ExternalLink, ChevronDown, ChevronUp, Loader2, CheckCheck, Pencil, Save } from "lucide-react";
import { DeleteButton } from "@/components/ui/delete-button";
import { handleCancelSubscription } from "@/app/actions";
import { SUBSCRIPTION_META, VALID_CURRENCIES } from "@/config/subscriptions";
import { SUB_STATUS } from "@/lib/constants/statuses";

function advanceDueDate(current: string | null, frequency: string | null): string {
  const base = current ? new Date(current) : new Date();
  switch (frequency) {
    case "annual":     base.setFullYear(base.getFullYear() + 1); break;
    case "quarterly":  base.setMonth(base.getMonth() + 3); break;
    case "weekly":     base.setDate(base.getDate() + 7); break;
    default:           base.setMonth(base.getMonth() + 1); break; // monthly
  }
  return base.toISOString();
}

export function SubscriptionActions({
  subId,
  subName,
  status,
  nextDue,
  frequency,
  amount,
  currency,
  notes,
  paymentMethod,
  vendor,
}: {
  subId: string;
  subName: string;
  status: string | null;
  nextDue: string | null;
  frequency: string | null;
  amount?: number | null;
  currency?: string | null;
  notes?: string | null;
  paymentMethod?: string | null;
  vendor?: string | null;
}) {
  const router = useRouter();
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [paid, setPaid] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(subName);
  const [editVendor, setEditVendor] = useState(vendor ?? "");
  const [editAmount, setEditAmount] = useState(amount != null ? String(amount) : "");
  const [editCurrency, setEditCurrency] = useState(currency ?? "CHF");
  const [editNotes, setEditNotes] = useState(notes ?? "");
  const [editPaymentMethod, setEditPaymentMethod] = useState(paymentMethod ?? "");
  const [saving, setSaving] = useState(false);

  const meta = SUBSCRIPTION_META[subName];
  const isCancelled = status === SUB_STATUS.CANCELLED;
  const isOneTime = frequency === "one-time";

  async function onDeleteRecord() {
    await fetch(`/api/subscriptions/${subId}`, { method: "DELETE" });
    setDeleted(true);
    router.refresh();
  }

  async function onCancel() {
    setCancelling(true);
    await handleCancelSubscription(subId);
    setCancelled(true);
  }

  async function onMarkPaid() {
    setMarkingPaid(true);
    try {
      const newDue = advanceDueDate(nextDue, frequency);
      await fetch(`/api/subscriptions/${subId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nextDue: newDue }),
      });
      setPaid(true);
      router.refresh();
    } finally {
      setMarkingPaid(false);
    }
  }

  async function onSaveEdit() {
    setSaving(true);
    try {
      await fetch(`/api/subscriptions/${subId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim() || undefined,
          vendor: editVendor.trim() || null,
          amount: editAmount ? parseFloat(editAmount) : null,
          currency: editCurrency,
          notes: editNotes || null,
          paymentMethod: editPaymentMethod || null,
        }),
      });
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (deleted) return null;

  if (cancelled) {
    return (
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-white/30">Marked cancelled</span>
        <DeleteButton
          onDelete={onDeleteRecord}
          label="Delete record?"
          triggerClassName="flex items-center gap-1 text-xs text-white/20 hover:text-red-400 transition-colors"
        />
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {/* Mark paid — advances nextDue by one billing period (not for one-time or cancelled) */}
      {!isCancelled && !isOneTime && !paid && (
        <button
          onClick={onMarkPaid}
          disabled={markingPaid}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-emerald-400/20 text-emerald-400/60 hover:text-emerald-400 hover:bg-emerald-400/5 transition-colors disabled:opacity-50"
        >
          {markingPaid ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <CheckCheck className="h-2.5 w-2.5" />}
          Mark paid
        </button>
      )}
      {paid && <span className="text-xs text-emerald-400/50">Next due updated</span>}

      {/* Inline edit for amount/currency/notes */}
      {!isCancelled && (
        <button
          onClick={() => setEditing((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-white/10 text-white/25 hover:text-white/60 hover:bg-white/5 transition-colors"
          title="Edit amount, currency, notes"
        >
          <Pencil className="h-2.5 w-2.5" />
          Edit
        </button>
      )}

      {/* Cancel at provider — only when meta is configured */}
      {meta && (
        <a
          href={meta.cancelUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-red-400/20 text-red-400/70 hover:text-red-400 hover:bg-red-400/5 transition-colors"
        >
          <ExternalLink className="h-2.5 w-2.5" />
          Cancel at {new URL(meta.cancelUrl).hostname.replace("www.", "")}
        </a>
      )}

      {/* Mark as cancelled — inline confirm */}
      {!isCancelled && (confirmCancel ? (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-white/40">Mark cancelled?</span>
          <button onClick={onCancel} disabled={cancelling}
            className="text-xs text-red-400 hover:text-red-300 transition-colors px-1 disabled:opacity-50">
            Yes
          </button>
          <button onClick={() => setConfirmCancel(false)}
            className="text-xs text-white/30 hover:text-white/60 transition-colors px-1">
            No
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirmCancel(true)}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-white/10 text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors">
          <X className="h-2.5 w-2.5" />
          Mark cancelled
        </button>
      ))}

      {/* Delete record permanently */}
      <DeleteButton
        onDelete={async () => {
          await fetch(`/api/subscriptions/${subId}`, { method: "DELETE" });
          setDeleted(true);
          router.refresh();
        }}
        label="Delete record?"
        triggerTitle="Delete subscription record"
        triggerClassName="flex items-center gap-1 px-2 py-1 text-xs rounded border border-white/10 text-white/20 hover:text-red-400 hover:bg-red-400/5 transition-colors"
      />

      {editing && (
        <div className="w-full mt-1 p-2.5 rounded bg-white/[0.03] border border-white/10 space-y-2">
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Name"
            className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/25"
          />
          <input
            value={editVendor}
            onChange={(e) => setEditVendor(e.target.value)}
            placeholder="Vendor (optional)"
            className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/25"
          />
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              placeholder="Amount"
              className="w-24 bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/25"
            />
            <select
              value={editCurrency}
              onChange={(e) => setEditCurrency(e.target.value)}
              className="bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/80 focus:outline-none focus:border-white/25"
            >
              {VALID_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <input
            value={editPaymentMethod}
            onChange={(e) => setEditPaymentMethod(e.target.value)}
            placeholder="Payment method (e.g. Visa ····1234)"
            className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/25"
          />
          <input
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSaveEdit(); if (e.key === "Escape") setEditing(false); }}
            placeholder="Notes (optional)"
            className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/25"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={onSaveEdit}
              disabled={saving}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-medium transition-colors"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-white/30 hover:text-white/60 px-1">Cancel</button>
          </div>
        </div>
      )}

      {/* Free alternatives — only when meta is configured */}
      {meta && !meta.essential && meta.alternatives.length > 0 && (
        <button
          onClick={() => setShowAlternatives(!showAlternatives)}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-emerald-400/20 text-emerald-400/60 hover:text-emerald-400 hover:bg-emerald-400/5 transition-colors"
        >
          <Lightbulb className="h-2.5 w-2.5" />
          Free alternatives
          {showAlternatives ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
        </button>
      )}

      {showAlternatives && meta && (
        <div className="w-full mt-1 p-2 rounded bg-emerald-400/5 border border-emerald-400/10">
          <div className="text-xs text-emerald-400/60 font-medium mb-1">Alternatives:</div>
          {meta.alternatives.map((alt, i) => (
            <div key={i} className="text-xs text-white/40">• {alt}</div>
          ))}
        </div>
      )}
    </div>
  );
}
