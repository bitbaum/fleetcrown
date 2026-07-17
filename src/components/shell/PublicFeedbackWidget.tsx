"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isFeedbackWidgetRoute } from "@/config/feedback-widget";

/**
 * Dogfood embed of FleetCrown's own feedback widget on the public pages
 * (docs/architecture/feedback-widget.md, Phase 4). Injects the exact same
 * /widget.js script tag a customer site would use — same code path, same
 * ingest API — pointed at the project the FEEDBACK_WIDGET_TOKEN env var
 * belongs to. Rendered by the root layout only when that env var is set.
 *
 * Imperative injection (not a JSX <script>) so route changes can mount and
 * unmount it cleanly along with the host element the widget creates.
 */
export function PublicFeedbackWidget({ token }: { token: string }) {
  const pathname = usePathname();
  const show = isFeedbackWidgetRoute(pathname ?? "");

  useEffect(() => {
    if (!show) return;
    const script = document.createElement("script");
    script.src = "/widget.js";
    script.async = true;
    script.setAttribute("data-fc-project", token);
    document.body.appendChild(script);
    return () => {
      script.remove();
      document.getElementById("fleetcrown-feedback-host")?.remove();
    };
  }, [show, token]);

  return null;
}
