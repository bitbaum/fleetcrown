-- Migration: user_projects.auto_ship — may FleetCrown merge the pull request
-- an agent opened for a visitor's feedback, once it is genuinely green?
--
-- Three states on purpose. NULL = the operator has never chosen, so the
-- project's Feedback section invites them rather than showing a switch that
-- looks like a decision someone already made. FALSE = chosen off; stop asking.
-- TRUE = FleetCrown merges that PR (and only that PR) when GitHub says it is
-- mergeable and its checks passed.
--
-- Nullable and additive: every existing project keeps today's behaviour, where
-- the feedback row asks a person to merge. That default also protects client
-- sites by construction — FleetCrown cannot tell a client site from its own
-- (that ledger lives in scripts/hetzner/apps.conf, not in this database), so
-- nothing ships itself until someone says so per project.

ALTER TABLE "user_projects" ADD COLUMN IF NOT EXISTS "auto_ship" boolean;
