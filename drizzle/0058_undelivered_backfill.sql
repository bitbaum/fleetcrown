-- Reclassify the runs that were recorded as `timeout` but which the RUNNER
-- ITSELF reported as never started.
--
-- No DDL: `outcome` is a text column, so this migration exists purely to make
-- history true. It matters because that history is the training input for the
-- nightly improver (#136) and the evidence base for "is this project failing?"
-- — and 29 of 157 timeouts measured on 2026-08-26 were not agent timeouts at
-- all. Their prompts never arrived.
--
-- The predicate is the same one the reaper already computes (runNeverStarted
-- in cleanupStaleOrchestrationRuns): a pending_command for this run that was
-- executed and acked `verified: false`. It is the runner's own statement, not
-- an inference — which is why relabelling history from it is safe. Runs where
-- delivery is merely UNKNOWN are left alone; absence of an ack is not evidence
-- of non-delivery, and `payload.deliveredAt` was only stamped reliably from
-- August onward.
--
-- Deliberately narrow:
--   * only `timeout` rows are touched (never a success, partial or error)
--   * `state` stays `error` — the run really did fail, just not the way the
--     old label claimed
--   * the explanation is rewritten too, because `payload.error` renders on the
--     project card and "Timed out — run exceeded maximum duration" sends the
--     reader to the agent, which is the one place the fault is not.

--> statement-breakpoint
UPDATE "orchestration_runs" r
SET "outcome" = 'undelivered',
    "payload" = jsonb_set(
      COALESCE(r."payload", '{}'),
      '{error}',
      to_jsonb('The prompt never reached an agent — the runner reported this dispatch as never started. Check the builder, not the project.'::text)
    )
WHERE r."outcome" = 'timeout'
  AND EXISTS (
    SELECT 1
    FROM "pending_commands" pc
    WHERE pc."payload"->>'runId' = r."id"::text
      AND pc."executed_at" IS NOT NULL
      AND pc."result"->>'verified' = 'false'
  );
