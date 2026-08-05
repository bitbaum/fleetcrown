import type { UseAiForm } from "@fleet/ai-forms/react";

/**
 * The form the user currently has open, published so the floating assistant can
 * write into it instead of describing which buttons to press.
 *
 * The handle exposes a getter rather than the hook result itself: `useAiForm`
 * returns a fresh object every render, so storing it directly would make
 * `useSyncExternalStore` see a new value on every keystroke and re-render in a
 * loop. Subscribers are notified only when a form opens or closes; the current
 * values are read at call time.
 */
export type ActiveFormHandle = {
  /** Modal title, shown to the user so it is obvious what is being edited. */
  title: string;
  getAssist: () => UseAiForm | undefined;
};

export const ACTIVE_FORM_EVENT = "fleetcrown:active-form";

let current: ActiveFormHandle | null = null;

export function setActiveForm(next: ActiveFormHandle | null): void {
  current = next;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ACTIVE_FORM_EVENT));
  }
}

export function readActiveForm(): ActiveFormHandle | null {
  return current;
}

export function subscribeActiveForm(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(ACTIVE_FORM_EVENT, onChange);
  return () => window.removeEventListener(ACTIVE_FORM_EVENT, onChange);
}
