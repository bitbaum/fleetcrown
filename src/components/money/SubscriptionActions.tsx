"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Lightbulb, ExternalLink, ChevronDown, ChevronUp, Loader2, CheckCheck, Pencil, Save } from "lucide-react";
import { DeleteButton } from "@/components/ui/delete-button";
import { handleCancelSubscription } from "@/app/actions";
import { SUBSCRIPTION_META, VALID_CURRENCIES, VALID_FREQUENCIES, FREQUENCY } from "@/config/subscriptions";
import { SUB_STATUS } from "@/lib/constants/statuses";
import { INLINE_SAVE_CLASS } from "@/components/ui/form";
import { patchJson, deleteJson } from "@/lib/api/fetch";
import { advanceDueDate } from "@/lib/dates";

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
  const [editFrequency, setEditFrequency] = useState(frequency ?? FREQUENCY.MONTHLY);
  const [editNextDue, setEditNextDue] = useState(nextDue?.slice(0, 10) ?? "");
  const [editNotes, setEditNotes] = useState(notes ?? "");
  const [editPaymentMethod, setEditPaymentMethod] = useState(paymentMethod ?? "");
  const [saving, setSaving] = useState(false);

  const meta = SUBSCRIPTION_META[subName];
  const isCancelled = status === SUB_STATUS.CANCELLED;
  const isOneTime = frequency === FREQUENCY.ONE_TIME;

  async function onDeleteRecord() {
    await deleteJson(`/api/subscriptions/${subId}`);
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
      await patchJson(`/api/subscriptions/${subId}`, { nextDue: newDue });
      setPaid(true);
      router.refresh();
    } finally {
      setMarkingPaid(false);
    }
  }

  async function onSaveEdit() {
    setSaving(true);
    try {
      await patchJson(`/api/subscriptions/${subId}`, {
        name: editName.trim() || undefined,
        vendor: editVendor.trim() || null,
        amount: editAmount ? parseFloat(editAmount) : null,
        currency: editCurrency,
        frequency: editFrequency,
        nextDue: editNextDue || null,
        notes: editNotes || null,
        paymentMethod: editPaymentMethod || null,
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
        <span className="text-xs text-text-muted">Marked cancelled</span>
        <DeleteButton
          onDelete={onDeleteRecord}
          label="Delete record?"
          triggerClassName="flex items-center gap-1 text-xs text-text-muted hover:text-status-negative transition-colors"
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
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-status-positive/20 text-status-positive/60 hover:text-status-positive hover:bg-status-positive/5 transition-colors disabled:opacity-50"
        >
          {markingPaid ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <CheckCheck className="h-2.5 w-2.5" />}
          Mark paid
        </button>
      )}
      {paid && <span className="text-xs text-status-positive/50">Next due updated</span>}

      {/* Inline edit for amount/currency/notes */}
      {!isCancelled && (
        <button
          onClick={() => setEditing((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border-subtle text-text-muted hover:text-text-secondary hover:bg-surface-raised transition-colors"
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
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-status-negative/20 text-status-negative/70 hover:text-status-negative hover:bg-status-negative/5 transition-colors"
        >
          <ExternalLink className="h-2.5 w-2.5" />
          Cancel at {new URL(meta.cancelUrl).hostname.replace("www.", "")}
        </a>
      )}

      {/* Mark as cancelled — inline confirm */}
      {!isCancelled && (confirmCancel ? (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-tertiary">Mark cancelled?</span>
          <button onClick={onCancel} disabled={cancelling}
            className="text-xs text-status-negative hover:text-status-negative transition-colors px-1 disabled:opacity-50">
            Yes
          </button>
          <button onClick={() => setConfirmCancel(false)}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors px-1">
            No
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirmCancel(true)}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border-subtle text-text-muted hover:text-text-secondary hover:bg-surface-raised transition-colors">
          <X className="h-2.5 w-2.5" />
          Mark cancelled
        </button>
      ))}

      {/* Delete record permanently */}
      <DeleteButton
        onDelete={onDeleteRecord}
        label="Delete record?"
        triggerTitle="Delete subscription record"
        triggerClassName="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border-subtle text-text-muted hover:text-status-negative hover:bg-status-negative/5 transition-colors"
      />

      {editing && (
        <div className="w-full mt-1 p-2.5 rounded bg-surface-base border border-border-subtle space-y-2">
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Name"
            className="w-full ui-input-tight"
          />
          <input
            value={editVendor}
            onChange={(e) => setEditVendor(e.target.value)}
            placeholder="Vendor (optional)"
            className="w-full ui-input-tight"
          />
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              placeholder="Amount"
              className="w-24 ui-input-tight"
            />
            <select
              value={editCurrency}
              onChange={(e) => setEditCurrency(e.target.value)}
              className="ui-input-tight"
            >
              {VALID_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={editFrequency}
              onChange={(e) => setEditFrequency(e.target.value)}
              className="flex-1 ui-input-tight"
            >
              {VALID_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-[11px] text-text-muted shrink-0">Next due</label>
            <input
              type="date"
              value={editNextDue}
              onChange={(e) => setEditNextDue(e.target.value)}
              className="flex-1 ui-input-tight"
            />
          </div>
          <input
            value={editPaymentMethod}
            onChange={(e) => setEditPaymentMethod(e.target.value)}
            placeholder="Payment method (e.g. Visa ····1234)"
            className="w-full ui-input-tight"
          />
          <input
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSaveEdit(); if (e.key === "Escape") setEditing(false); }}
            placeholder="Notes (optional)"
            className="w-full ui-input-tight"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={onSaveEdit}
              disabled={saving}
              className={INLINE_SAVE_CLASS}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-text-muted hover:text-text-secondary px-1">Cancel</button>
          </div>
        </div>
      )}

      {/* Free alternatives — only when meta is configured */}
      {meta && !meta.essential && meta.alternatives.length > 0 && (
        <button
          onClick={() => setShowAlternatives(!showAlternatives)}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-status-positive/20 text-status-positive/60 hover:text-status-positive hover:bg-status-positive/5 transition-colors"
        >
          <Lightbulb className="h-2.5 w-2.5" />
          Free alternatives
          {showAlternatives ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
        </button>
      )}

      {showAlternatives && meta && (
        <div className="w-full mt-1 p-2 rounded bg-status-positive/5 border border-status-positive/10">
          <div className="text-xs text-status-positive/60 font-medium mb-1">Alternatives:</div>
          {meta.alternatives.map((alt, i) => (
            <div key={i} className="text-xs text-text-tertiary">• {alt}</div>
          ))}
        </div>
      )}
    </div>
  );
}
