"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2 } from "lucide-react";

const CURRENCIES = ["CHF", "USD", "EUR", "GBP"] as const;
const FREQUENCIES = ["monthly", "annual", "quarterly", "weekly", "one-time"] as const;

export function NewSubscriptionButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<typeof CURRENCIES[number]>("CHF");
  const [frequency, setFrequency] = useState<typeof FREQUENCIES[number]>("monthly");
  const [nextDue, setNextDue] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName(""); setVendor(""); setAmount(""); setCurrency("CHF");
    setFrequency("monthly"); setNextDue(""); setPaymentMethod(""); setError(null);
  };
  const close = () => { reset(); setOpen(false); };

  const handleCreate = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          vendor: vendor.trim() || undefined,
          amount: amount ? parseFloat(amount) : undefined,
          currency,
          frequency,
          nextDue: nextDue || undefined,
          paymentMethod: paymentMethod.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error ?? "Failed to create subscription"); return; }
      close();
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />
          <div className="relative w-full max-w-md bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Add Subscription</div>
              <button onClick={close} className="p-1 text-white/40 hover:text-white/70 rounded">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") close(); }}
                  placeholder="e.g. GitHub Copilot"
                  autoFocus
                  className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Vendor</label>
                <input
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="e.g. GitHub Inc."
                  className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as typeof CURRENCIES[number])}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/25 transition-colors"
                  >
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Frequency</label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as typeof FREQUENCIES[number])}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/25 transition-colors"
                  >
                    {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Next Due</label>
                  <input
                    type="date"
                    value={nextDue}
                    onChange={(e) => setNextDue(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/25 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Payment Method</label>
                <input
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  placeholder="e.g. Visa ····1234"
                  className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors"
                />
              </div>
            </div>

            {error && (
              <div className="text-xs text-red-400 bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={saving || !name.trim()}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</>
              ) : (
                <><Plus className="h-4 w-4" /> Add Subscription</>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
