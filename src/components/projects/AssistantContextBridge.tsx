"use client";

import { useEffect } from "react";
import { setAssistantContext, type AssistantProjectContext } from "@/lib/assistant-context";

/** Renders nothing — publishes the profile's context to the floating
 *  assistant for the lifetime of the page. */
export function AssistantContextBridge({ context }: { context: AssistantProjectContext }) {
  useEffect(() => {
    setAssistantContext(context);
    return () => setAssistantContext(null);
    // The context object is rebuilt every server render; key on the stable
    // identity + content fields to avoid a publish loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(context)]);
  return null;
}
