-- Rename the outcome introduced in 0058: `undelivered` → `unconfirmed`.
--
-- 0058 shipped a label that claimed more than the evidence supports, and the
-- explanation it wrote into payload.error said the prompt "never reached an
-- agent". Reading the runner's actual acks afterwards showed otherwise:
--
--   {"ok": true, "text": "injected to running claude (pty)",
--    "verified": false,
--    "warning": "... the agent isn't generating yet — it may still be
--                booting or already idle"}
--
-- The runner INJECTED. What it could not establish is whether the agent picked
-- the prompt up. Both readings stay open — the pane may have been idle with
-- the agent gone, or the agent may have been wedged — so the outcome must name
-- the observation, not pick a conclusion.
--
-- `undelivered` was also already taken. `closeRunUndelivered` handles a runner
-- NACK (`ok: false`, the prompt provably never landed) and closes as `error`.
-- Overloading that name with a weaker signal put two different confidences
-- behind one word, which is the same defect 0058 was written to remove.
--
-- Nothing about behaviour changes: `unconfirmed` is still a failing outcome,
-- the brake still stops, the ladder still advances. Only the claim narrows.

--> statement-breakpoint
UPDATE "orchestration_runs"
SET "outcome" = 'unconfirmed',
    "payload" = jsonb_set(
      COALESCE("payload", '{}'),
      '{error}',
      to_jsonb('The prompt was injected, but the agent was never seen starting work — nothing ran to completion. Safe to retry: no work was recorded for this run.'::text)
    )
WHERE "outcome" = 'undelivered';
