"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Lightbulb, ExternalLink, ChevronDown, ChevronUp, Loader2, CheckCheck, Pencil, Save } from "lucide-react";
import { IvyDispatchButton } from "@/components/shared/IvyDispatchButton";
import { DeleteButton } from "@/components/ui/delete-button";
import { handleCancelSubscription } from "@/app/actions";
import { SUBSCRIPTION_META, VALID_CURRENCIES, VALID_FREQUENCIES, FREQUENCY } from "@/config/subscriptions";
import { SUB_STATUS } from "@/lib/constants/statuses";
import { patchJson, deleteJson, throwApiError } from "@/lib/api/fetch";
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
  const [paidError, setPaidError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
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
    const res = await deleteJson(`/api/subscriptions/${subId}`);
    if (!res.ok) await throwApiError(res, "Failed to delete");
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
    setPaidError(null);
    try {
      const newDue = advanceDueDate(nextDue, frequency);
      const res = await patchJson(`/api/subscriptions/${subId}`, { nextDue: newDue });
      if (!res.ok) await throwApiError(res, "Failed to mark paid");
      setPaid(true);
      router.refresh();
    } catch (e) {
      setPaidError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setMarkingPaid(false);
    }
  }

  async function onSaveEdit() {
    setSaving(true);
    setEditError(null);
    try {
      const res = await patchJson(`/api/subscriptions/${subId}`, {
        name: editName.trim() || undefined,
        vendor: editVendor.trim() || null,
        amount: editAmount ? parseFloat(editAmount) : null,
        currency: editCurrency,
        frequency: editFrequency,
        nextDue: editNextDue || null,
        notes: editNotes || null,
        paymentMethod: editPaymentMethod || null,
      });
      if (!res.ok) await throwApiError(res, "Failed to save");
      setEditing(false);
      router.refresh();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const ivyPrompt = [
    `Subscription: ${subName}`,
    vendor && `Vendor: ${vendor}`,
    amount != null && `Cost: ${amount} ${currency ?? "CHF"} / ${frequency ?? "month"}`,
    nextDue && `Next due: ${nextDue.slice(0, 10)}`,
    notes && `Notes: ${notes}`,
    "",
    "Is this subscription worth keeping? Are there cheaper alternatives, or ways to consolidate or cut costs?",
  ].filter(Boolean).join("\n");

  if (deleted) return null;

  if (cancelled) {
    return (
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-text-tertiary">Marked cancelled</span>
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
          className="ui-btn-xs border-status-positive/20 text-status-positive/60 hover:text-status-positive hover:bg-status-positive/5"
        >
          {markingPaid ? <Loader2 className="ui-spinner-2xs" /> : <CheckCheck className="h-2.5 w-2.5" />}
          Mark paid
        </button>
      )}
      {paid && <span className="text-xs text-status-positive/50">Next due updated</span>}
      {paidError && <span className="ui-error-xs">{paidError}</span>}

      {/* Inline edit for amount/currency/notes */}
      {!isCancelled && (
        <button
          onClick={() => setEditing((v) => !v)}
          className="ui-btn-xs"
          title="Edit amount, currency, notes"
        >
          <Pencil className="h-2.5 w-2.5" />
          Edit
        </button>
      )}

      <IvyDispatchButton
        prompt={ivyPrompt}
        title="Ask Ivy about this subscription"
        className="p-1 rounded text-text-muted hover:text-status-positive transition-colors"
      />

      {/* Cancel at provider — only when meta is configured */}
      {meta && (
        <a
          href={meta.cancelUrl}
          target="_blank"
          rel="noreferrer"
          className="ui-btn-xs border-status-negative/20 text-status-negative/70 hover:text-status-negative hover:bg-status-negative/5"
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
            className="ui-btn-text-cancel">
            No
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirmCancel(true)}
          className="ui-btn-xs">
          <X className="h-2.5 w-2.5" />
          Mark cancelled
        </button>
      ))}

      {/* Delete record permanently */}
      <DeleteButton
        onDelete={onDeleteRecord}
        label="Delete record?"
        triggerTitle="Delete subscription record"
        triggerClassName="ui-btn-xs hover:text-status-negative hover:bg-status-negative/5"
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
            <label className="text-xs text-text-tertiary shrink-0">Next due</label>
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
              className="ui-btn-save"
            >
              {saving ? <Loader2 className="ui-spinner-xs" /> : <Save className="h-3 w-3" />}
              Save
            </button>
            <button onClick={() => { setEditing(false); setEditError(null); }} className="ui-btn-text-cancel">Cancel</button>
          </div>
          {editError && <p className="ui-error-xs">{editError}</p>}
        </div>
      )}

      {/* Free alternatives — only when meta is configured */}
      {meta && !meta.essential && meta.alternatives.length > 0 && (
        <button
          onClick={() => setShowAlternatives(!showAlternatives)}
          className="ui-btn-xs border-status-positive/20 text-status-positive/60 hover:text-status-positive hover:bg-status-positive/5"
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
