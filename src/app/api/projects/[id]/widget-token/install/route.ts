import { NextRequest, NextResponse } from "next/server";
import { readIdParam, readJsonBody, jsonError, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { getProjectCore } from "@/db/queries/projects";
import { getActiveWidgetToken } from "@/db/queries/widget-tokens";
import { injectPrompt } from "@/lib/inject-core";
import { appUrl } from "@/lib/email";

/**
 * One-click widget install/uninstall for repo-linked projects (Phase 2 of the
 * widget one-click plan): dispatch an agent to add or remove the embed snippet
 * in the project's own codebase, through the same injectPrompt SSOT as every
 * other dispatch. The snippet is a dumb pointer, so "off instantly" stays the
 * Pause button — this is for actually landing/removing the code, verified and
 * PR'd like any other agent change.
 */

const InstallBody = z.object({
  mode: z.enum(["install", "uninstall"]).default("install"),
});

function snippetFor(token: string): string {
  const base = appUrl().replace(/\/$/, "");
  return `<script src="${base}/widget.js" data-fc-project="${token}" async></script>`;
}

function composeInstallPrompt(projectName: string, token: string): string {
  return [
    `Install the FleetCrown feedback widget on ${projectName}'s public site.`,
    "",
    "THE SNIPPET (use exactly this — do not alter the token or attributes):",
    "```html",
    snippetFor(token),
    "```",
    "",
    "1. If this exact snippet (or an embed referencing the same widget.js + data-fc-project token) is already present anywhere in the codebase, do NOT add a second one — verify it renders and report that in your handoff.",
    "2. Otherwise add it once, in the site's root layout/template so it loads on every public page:",
    "   - Next.js App Router: a small 'use client' component that appends the script tag in a useEffect (mounted from the root layout), or next/script with strategy=\"afterInteractive\" carrying the same src + data-fc-project attributes.",
    "   - Plain HTML / other frameworks: the raw tag right before </body> in the base template.",
    "3. If the site already has its own floating action button in the bottom-right corner, add data-fc-bottom=\"88\" to the snippet so the widget FAB stacks above it instead of overlapping.",
    "4. Verify: run the site locally and confirm the page loads without console errors from the embed. (The FAB itself may stay hidden — rendering is server-gated per token — absence of the button is NOT a failure; absence of errors is the check.)",
    "5. Ship it the way this repo ships changes (branch + PR if that's the convention). Smallest possible diff — the embed and nothing else.",
    "6. HANDOFF: state the exact file(s) touched and the verification evidence.",
  ].join("\n");
}

function composeUninstallPrompt(projectName: string, token: string | null): string {
  const marker = token ? `data-fc-project="${token}"` : "data-fc-project";
  return [
    `Remove the FleetCrown feedback widget embed from ${projectName}'s codebase.`,
    "",
    `1. Find every trace of the embed: search for "widget.js" together with ${marker}, and for any component that injects that script tag (a name like FleetCrownFeedbackEmbed is typical).`,
    "2. Remove the snippet/component and its mount point (e.g. the import + JSX usage in the layout). Delete the embed component file if it exists solely for this.",
    "3. Do NOT touch anything else — no unrelated cleanup.",
    "4. Verify: the site builds and runs locally with no dangling imports and no reference to the widget left (grep proves it).",
    "5. Ship it the way this repo ships changes (branch + PR if that's the convention).",
    "6. HANDOFF: state the file(s) touched and the grep evidence that zero references remain. If no embed exists in the codebase, change nothing and report that.",
  ].join("\n");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getApiUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const idOrResp = await readIdParam(params);
  if (idOrResp instanceof NextResponse) return idOrResp;
  const dataOrResp = await readJsonBody(req, InstallBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  const project = await getProjectCore(userId, idOrResp);
  if (!project) return jsonError("Project not found", 404);

  // Install needs the token (the snippet embeds it); uninstall works from
  // generic markers even after a revoke.
  const token = await getActiveWidgetToken(userId, idOrResp);
  const prompt =
    dataOrResp.mode === "install"
      ? token
        ? composeInstallPrompt(project.name, token.token)
        : null
      : composeUninstallPrompt(project.name, token?.token ?? null);
  if (!prompt) {
    return jsonError("Enable the widget first — the install snippet embeds the project token", 400);
  }

  const { status, body } = await injectPrompt({ tab: project.name, customPrompt: prompt }, userId);
  return NextResponse.json(body, { status });
}
