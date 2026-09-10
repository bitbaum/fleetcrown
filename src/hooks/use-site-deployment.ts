"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type SiteDeployment = {
  registered?: boolean;
  liveUrl?: string | null;
  deploymentStatus?: "pending" | "failed" | "live";
  deploymentUrl?: string | null;
  reason?: string | null;
  command?: string | null;
};

/** Reconcile deployment evidence on reopen and after registration, without creating work. */
export function useSiteDeployment(projectId: string, checkOnMount = false) {
  const router = useRouter();
  const [deployment, setDeployment] = useState<SiteDeployment | null>(null);
  const shouldCheck = checkOnMount || Boolean(deployment?.registered);
  useEffect(() => {
    if (!shouldCheck || deployment?.liveUrl || deployment?.deploymentStatus === "failed") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 15 * 60_000;
    async function check() {
      try {
        const res = await fetch(`/api/projects/${projectId}/register-cd`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const json = await res.json();
        if (controller.signal.aborted) return;
        if (!res.ok || !json.ok) {
          // A status we cannot read is not "still deploying". Say so and stop.
          const error = typeof json?.error === "string" ? json.error : `HTTP ${res.status}`;
          setDeployment((current) => ({
            ...(current ?? {}),
            deploymentStatus: "failed",
            reason: error,
          }));
          return;
        }
        setDeployment(json);
        if (json.liveUrl) {
          router.refresh();
          return;
        }
        if (!json.registered || json.deploymentStatus === "failed") return;
      } catch {
        if (controller.signal.aborted) return;
      }
      if (Date.now() < deadline) timer = setTimeout(check, 10_000);
      else
        setDeployment(
          (current) =>
            current && {
              ...current,
              reason:
                "Deployment is taking longer than expected. Check deployment progress or reopen the project to check again.",
            },
        );
    }
    timer = setTimeout(check, checkOnMount ? 0 : 5000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [
    projectId,
    shouldCheck,
    checkOnMount,
    deployment?.liveUrl,
    deployment?.deploymentStatus,
    router,
  ]);
  return { deployment, setDeployment };
}
