-- 0012: deterministic uniqueness on project_states by case-insensitive key.
--
-- Background: the composite primary key (user_id, project_key) is case-
-- sensitive. Two writer paths reached upsertProjectState with different
-- casings of the same logical project — the API canonical path used
-- user_projects.name ("Cockpit") and the daemon path used the zellij tab
-- name ("cockpit") — so the conflict target missed and a duplicate row
-- was inserted. Reads like getProjectStatesByUserId then returned both
-- rows and downstream code that iterated them could let an empty row
-- stomp the row that held the real queue. We added defensive .toLowerCase
-- grouping in runtime-state/route.ts and stream/route.ts (commit 852c51b),
-- but that's a workaround in two places; the constraint belongs in the
-- database.
--
-- Step 1: dedupe any existing collisions deterministically. The winner is
-- the row with the longest prompt_queue (so we don't lose user data), with
-- updated_at DESC as tiebreaker. The runtime-state push repopulates
-- tab_open / session_status on the next heartbeat, so losing those fields
-- on the dropped row is acceptable.
--
-- Step 2: enforce the constraint with a functional unique index. From this
-- point on, any future writer that bypasses normalization will get a
-- DB-level violation instead of silently creating a stale duplicate.

WITH ranked AS (
  SELECT
    user_id,
    project_key,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, lower(project_key)
      ORDER BY
        COALESCE(array_length(prompt_queue, 1), 0) DESC,
        updated_at DESC
    ) AS rn
  FROM project_states
),
losers AS (
  SELECT user_id, project_key FROM ranked WHERE rn > 1
)
DELETE FROM project_states ps
USING losers l
WHERE ps.user_id = l.user_id
  AND ps.project_key = l.project_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_states_user_lower_key
  ON project_states (user_id, lower(project_key));
