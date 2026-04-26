"use client";

import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { VALID_CURRENCIES as CURRENCIES, VALID_FREQUENCIES as FREQUENCIES, FREQUENCY } from "@/config/subscriptions";
import { Modal } from "@/components/ui/modal";
import { Field, FIELD_INPUT_CLASS, PRIMARY_BUTTON_CLASS } from "@/components/ui/form";
import { useCreateMutation } from "@/hooks/use-create-mutation";
import { postJson } from "@/lib/api/fetch";

type CreateSubscriptionBody = {
  name: string;
  vendor?: string;
  amount?: number;
  currency: typeof CURRENCIES[number];
  frequency: typeof FREQUENCIES[number];
  nextDue?: string;
  paymentMethod?: string;
};

export function NewSubscriptionButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<typeof CURRENCIES[number]>("CHF");
  const [frequency, setFrequency] = useState<typeof FREQUENCIES[number]>(FREQUENCY.MONTHLY);
  const [nextDue, setNextDue] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const { create, saving, error, setError } = useCreateMutation<CreateSubscriptionBody>({
    request: (body) => postJson("/api/subscriptions", body),
    errorLabel: "subscription",
  });

  const close = () => {
    setName(""); setVendor(""); setAmount(""); setCurrency("CHF");
    setFrequency(FREQUENCY.MONTHLY); setNextDue(""); setPaymentMethod("");
    setError(null);
    setOpen(false);
  };

  const handleCreate = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    const ok = await create({
      name: name.trim(),
      vendor: vendor.trim() || undefined,
      amount: amount ? parseFloat(amount) : undefined,
      currency,
      frequency,
      nextDue: nextDue || undefined,
      paymentMethod: paymentMethod.trim() || undefined,
    });
    if (ok) close();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add
      </button>

      {open && (
        <Modal onClose={close} size="md">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Add Subscription</div>
            <button onClick={close} className="p-1 text-white/40 hover:text-white/70 rounded">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            <Field label="Name" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. GitHub Copilot"
                autoFocus
                className={FIELD_INPUT_CLASS}
              />
            </Field>

            <Field label="Vendor">
              <input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="e.g. GitHub Inc."
                className={FIELD_INPUT_CLASS}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className={FIELD_INPUT_CLASS}
                />
              </Field>
              <Field label="Currency">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as typeof CURRENCIES[number])}
                  className={FIELD_INPUT_CLASS}
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Frequency">
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as typeof FREQUENCIES[number])}
                  className={FIELD_INPUT_CLASS}
                >
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="Next Due">
                <input
                  type="date"
                  value={nextDue}
                  onChange={(e) => setNextDue(e.target.value)}
                  className={FIELD_INPUT_CLASS}
                />
              </Field>
            </div>

            <Field label="Payment Method">
              <input
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                placeholder="e.g. Visa ····1234"
                className={FIELD_INPUT_CLASS}
              />
            </Field>
          </div>

            {error && (
              <div className="text-xs text-red-400 bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

          <button
            onClick={handleCreate}
            disabled={saving || !name.trim()}
            className={PRIMARY_BUTTON_CLASS}
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</>
            ) : (
              <><Plus className="h-4 w-4" /> Add Subscription</>
            )}
          </button>
        </Modal>
      )}
    </>
  );
}
