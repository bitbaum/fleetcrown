"use client";

import { useState } from "react";
import { VALID_CURRENCIES as CURRENCIES, VALID_FREQUENCIES as FREQUENCIES, FREQUENCY } from "@/config/subscriptions";
import { Field, FIELD_INPUT_CLASS } from "@/components/ui/form";
import { ModalForm } from "@/components/ui/modal-form";
import { useCreateMutation } from "@/hooks/use-create-mutation";
import { postJson } from "@/lib/api/fetch";
import type { CreateSubscriptionInput } from "@/db/queries/money";

export function NewSubscriptionButton() {
  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<typeof CURRENCIES[number]>("CHF");
  const [frequency, setFrequency] = useState<typeof FREQUENCIES[number]>(FREQUENCY.MONTHLY);
  const [nextDue, setNextDue] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");
  const { create, saving, error, setError } = useCreateMutation<CreateSubscriptionInput>({
    request: (body) => postJson("/api/subscriptions", body),
    errorLabel: "subscription",
  });

  const onReset = () => {
    setName(""); setVendor(""); setAmount(""); setCurrency("CHF");
    setFrequency(FREQUENCY.MONTHLY); setNextDue(""); setPaymentMethod(""); setNotes("");
    setError(null);
  };

  const onSubmit = () => create({
    name: name.trim(),
    vendor: vendor.trim() || undefined,
    amount: amount ? parseFloat(amount) : undefined,
    currency,
    frequency,
    nextDue: nextDue || undefined,
    paymentMethod: paymentMethod.trim() || undefined,
    notes: notes.trim() || undefined,
  });

  return (
    <ModalForm
      title="Add Subscription"
      submitLabel="Add Subscription"
      savingLabel="Adding…"
      size="md"
      canSubmit={!!name.trim()}
      saving={saving}
      error={error}
      onSubmit={onSubmit}
      onReset={onReset}
    >
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

      <Field label="Notes">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes"
          className={FIELD_INPUT_CLASS}
        />
      </Field>
    </ModalForm>
  );
}
