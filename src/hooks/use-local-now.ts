"use client";

import { useSyncExternalStore } from "react";

/** Never fires — "am I on the client" is not a value that changes. */
const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * The reader's own clock — `null` until the browser has taken over.
 *
 * Why a hook instead of `new Date()` in render: a "use client" component is
 * still server-rendered for the initial HTML, and the box runs UTC while the
 * reader does not. Calling `new Date()` during render therefore produces markup
 * from the WRONG clock and then a hydration mismatch (React #418) when the
 * browser disagrees. Everything that depends on the local wall clock — a
 * greeting, a date line, a morning-vs-evening affordance — has to wait for the
 * browser, so the wait is expressed once, here.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect` because it has a
 * first-class notion of a server snapshot: React uses `onServer` for SSR and
 * the hydration render, then re-renders with `onClient`. That is exactly the
 * shape of this problem, and it avoids the cascading render that setting state
 * in an effect causes.
 *
 * `null` is the honest value for "the clock is not knowable yet". Callers must
 * render something true at any hour for that case rather than guessing, which
 * is what makes the swap invisible instead of a flash of wrong content.
 *
 * Deliberately does NOT tick. Nothing on these surfaces is a live clock, and a
 * per-second interval on a page full of cards buys nothing.
 */
export function useLocalNow(): Date | null {
  const isClient = useSyncExternalStore(subscribe, onClient, onServer);
  return isClient ? new Date() : null;
}
