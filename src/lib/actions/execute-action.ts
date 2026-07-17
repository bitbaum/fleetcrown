import type { Action } from "@/db/schema/actions";
import { ACTION_TYPE } from "@/lib/constants/statuses";
import { markActionExecuted } from "@/db/queries/actions";
import { createCommitment } from "@/db/queries/today";
import { recordActionAuditEvent } from "@/db/queries/control-audit-events";
import { patchProject } from "@/db/queries/projects";
import { upsertEntityAttribute } from "@/db/queries/utils";
import { scheduleProjectProfileReindexByEntityId } from "@/lib/rag/reindex-project-profile";
import { sendTelegramMessage, selfTelegramTarget } from "@/lib/actions/telegram-send";
import { sendEmail } from "@/lib/email";
import { bookCalendarEvent } from "@/lib/actions/calendar-event";
import { isRuntimeAvailable } from "@/lib/runtime";

export type ExecuteActionResult = {
  /** true only when a real-world effect happened and the row reached status='executed'. */
  executed: boolean;
  /** true when the action type has no executor wired yet (left 'approved', nothing happened). */
  deferred?: boolean;
  /** populated when a wired executor threw (row left 'approved' for retry). */
  error?: string;
};

/** Action types whose executor isn't wired yet. Fail-closed: they pass the human
 *  gate but do nothing at execution until built. SEND_MESSAGE (Telegram),
 *  SEND_EMAIL (Resend) and CREATE_EVENT (gog calendar create) are now wired —
 *  see the switch below. */
const DEFERRED_TYPES = new Set<Action["type"]>([
  ACTION_TYPE.FOLLOW_UP,
  ACTION_TYPE.OTHER,
]);

type ProfileUpdatePayload = {
  kind: "profile_update";
  projectKey: string;
  fieldKey: string;
  value: string;
};

function parseProfileUpdatePayload(payload: Action["payload"]): ProfileUpdatePayload | null {
  if (!payload || payload.kind !== "profile_update") return null;
  const fieldKey = typeof payload.fieldKey === "string" ? payload.fieldKey.trim() : "";
  const value = typeof payload.value === "string" ? payload.value.trim() : "";
  const projectKey = typeof payload.projectKey === "string" ? payload.projectKey.trim() : "";
  if (!fieldKey || !value || !projectKey) return null;
  return { kind: "profile_update", fieldKey, value, projectKey };
}

async function executeProfileUpdate(
  userId: string,
  action: Action,
  update: ProfileUpdatePayload,
): Promise<ExecuteActionResult> {
  const entityId = action.entityId;
  if (!entityId) {
    await recordActionAuditEvent(userId, action, "failed", {
      reason: "profile_update missing entityId",
    });
    return { executed: false, error: "missing-entity" };
  }

  try {
    if (update.fieldKey === "description") {
      const updated = await patchProject(userId, entityId, { description: update.value });
      if (!updated) {
        await recordActionAuditEvent(userId, action, "failed", {
          reason: "project not found for description update",
        });
        return { executed: false, error: "not-found" };
      }
    } else {
      const ok = await upsertEntityAttribute(userId, entityId, update.fieldKey, update.value);
      if (!ok) {
        await recordActionAuditEvent(userId, action, "failed", {
          reason: "project not found for attribute update",
        });
        return { executed: false, error: "not-found" };
      }
    }

    scheduleProjectProfileReindexByEntityId(userId, entityId);

    const done = await markActionExecuted(action.id, userId);
    if (!done) {
      await recordActionAuditEvent(userId, action, "failed", {
        reason: "profile updated but action was not in 'approved' state to mark executed",
      });
      return { executed: false, error: "not-approved-at-execute-time" };
    }
    await recordActionAuditEvent(userId, action, "executed", {
      meta: { fieldKey: update.fieldKey, projectKey: update.projectKey },
    });
    return { executed: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordActionAuditEvent(userId, action, "failed", { reason: error });
    return { executed: false, error };
  }
}

/**
 * Perform an APPROVED action's real-world effect, then advance it to 'executed'.
 *
 * Contract (fail-closed): an action only reaches status='executed' on a real,
 * successful effect. Unimplemented types are DEFERRED (left 'approved', audited);
 * a wired executor that throws is caught, audited as 'failed', and left 'approved'
 * for retry. A wrong/duplicate real send is the worst outcome — when in doubt we
 * do NOT act. The caller must have already approved the action (IRON RULE).
 */
export async function executeAction(userId: string, action: Action): Promise<ExecuteActionResult> {
  const profileUpdate =
    action.type === ACTION_TYPE.OTHER ? parseProfileUpdatePayload(action.payload) : null;
  if (profileUpdate) {
    return executeProfileUpdate(userId, action, profileUpdate);
  }

  // External/irreversible types: gate passes, execution intentionally not yet enabled.
  if (DEFERRED_TYPES.has(action.type)) {
    await recordActionAuditEvent(userId, action, "deferred", {
      reason: `executor not yet enabled for type=${action.type}`,
    });
    return { executed: false, deferred: true };
  }

  try {
    switch (action.type) {
      case ACTION_TYPE.CREATE_COMMITMENT: {
        // Internal, reversible: writes to FleetCrown's own commitments table. Zero external risk.
        const payload = action.payload ?? {};
        const description =
          (typeof payload.commitment === "string" && payload.commitment.trim()) || action.title;
        const dueDate = typeof payload.dueDate === "string" ? payload.dueDate : undefined;
        const financialImpact =
          typeof payload.financialImpact === "string" ? payload.financialImpact : undefined;

        await createCommitment(userId, { description, dueDate, financialImpact }, "ivy-action");
        const done = await markActionExecuted(action.id, userId);
        if (!done) {
          // Lost the approved→executed guard (e.g. already executed); commitment was still created.
          await recordActionAuditEvent(userId, action, "failed", {
            reason: "commitment created but action was not in 'approved' state to mark executed",
          });
          return { executed: false, error: "not-approved-at-execute-time" };
        }
        await recordActionAuditEvent(userId, action, "executed");
        return { executed: true };
      }

      case ACTION_TYPE.CREATE_EVENT: {
        // External but reversible (an event can be deleted). Booked via the
        // locally-authenticated `gog` CLI — which only exists on the local
        // runtime. When approval happens on the cloud control plane (no gog),
        // we do NOT fake success: leave the row 'approved' and audit it as
        // deferred with an honest reason. The local runtime's calendar drain
        // (see api/actions/drain-events) picks it up and books it for real.
        if (!isRuntimeAvailable()) {
          await recordActionAuditEvent(userId, action, "deferred", {
            reason: "calendar runtime offline — awaiting local runtime to book via gog",
          });
          return { executed: false, deferred: true };
        }

        const booked = await bookCalendarEvent(action.payload, action.title);
        if (!booked.ok) {
          await recordActionAuditEvent(userId, action, "failed", { reason: booked.error });
          return { executed: false, error: booked.error };
        }

        const done = await markActionExecuted(action.id, userId);
        if (!done) {
          await recordActionAuditEvent(userId, action, "failed", {
            reason: "event booked but action was not in 'approved' state to mark executed",
          });
          return { executed: false, error: "not-approved-at-execute-time" };
        }
        await recordActionAuditEvent(userId, action, "executed", {
          meta: { eventId: booked.eventId ?? null, htmlLink: booked.htmlLink ?? null },
        });
        return { executed: true };
      }

      case ACTION_TYPE.SEND_MESSAGE: {
        // External + irreversible. Telegram only. The QUEUE APPROVAL is the gate now —
        // the operator approved this exact message + recipient — so we send to payload.to
        // (the approved recipient); empty recipient defaults to the operator.
        const payload = action.payload ?? {};
        const channel =
          (typeof payload.channel === "string" && payload.channel.trim()) || "telegram";
        if (channel !== "telegram") {
          await recordActionAuditEvent(userId, action, "deferred", {
            reason: `send channel not enabled: ${channel}`,
          });
          return { executed: false, deferred: true };
        }

        const target = (typeof payload.to === "string" && payload.to.trim()) || selfTelegramTarget();
        if (!target) {
          await recordActionAuditEvent(userId, action, "failed", {
            reason: "no telegram recipient and no self target configured",
          });
          return { executed: false, error: "no-target" };
        }

        const text = (typeof payload.body === "string" && payload.body.trim()) || action.title;
        const sent = await sendTelegramMessage(target, text);
        if (!sent.ok) {
          await recordActionAuditEvent(userId, action, "failed", {
            reason: sent.error ?? "telegram send failed",
          });
          return { executed: false, error: sent.error };
        }

        const done = await markActionExecuted(action.id, userId);
        if (!done) {
          await recordActionAuditEvent(userId, action, "failed", {
            reason: "telegram sent but action was not in 'approved' state to mark executed",
          });
          return { executed: false, error: "not-approved-at-execute-time" };
        }
        await recordActionAuditEvent(userId, action, "executed", {
          meta: { channel, to: target, messageId: sent.messageId ?? null },
        });
        return { executed: true };
      }

      case ACTION_TYPE.SEND_EMAIL: {
        // External + irreversible. Sent via Resend (FleetCrown's email) on approval.
        // (From a FleetCrown address, not the operator's Gmail — gog sends are blocked by
        // design; a true from-Gmail path is a later enhancement.)
        const payload = action.payload ?? {};
        if (!process.env.RESEND_API_KEY) {
          await recordActionAuditEvent(userId, action, "deferred", {
            reason: "email not configured (no RESEND_API_KEY)",
          });
          return { executed: false, deferred: true };
        }
        const to = typeof payload.to === "string" ? payload.to.trim() : "";
        if (!to.includes("@")) {
          await recordActionAuditEvent(userId, action, "failed", {
            reason: `invalid email recipient: ${to || "(none)"}`,
          });
          return { executed: false, error: "invalid-recipient" };
        }
        const subject = (typeof payload.subject === "string" && payload.subject.trim()) || action.title;
        const text =
          (typeof payload.body === "string" && payload.body.trim()) || action.description || action.title;
        const html = text
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

        await sendEmail(to, subject, html, text); // throws on Resend error → caught below
        const done = await markActionExecuted(action.id, userId);
        if (!done) {
          await recordActionAuditEvent(userId, action, "failed", {
            reason: "email sent but action was not in 'approved' state to mark executed",
          });
          return { executed: false, error: "not-approved-at-execute-time" };
        }
        await recordActionAuditEvent(userId, action, "executed", { meta: { channel: "email", to } });
        return { executed: true };
      }

      default: {
        // Unknown/unhandled type — fail closed rather than silently succeed.
        await recordActionAuditEvent(userId, action, "deferred", {
          reason: `no executor for type=${action.type}`,
        });
        return { executed: false, deferred: true };
      }
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordActionAuditEvent(userId, action, "failed", { reason: error });
    return { executed: false, error };
  }
}
