-- Migration: user_projects.builder_pref — the project's stored builder tier.
-- NULL = cloud (default). 'local' = the operator's own machine via Fleet Runner.
-- Routing reads this instead of guessing from runner presence.

ALTER TABLE "user_projects" ADD COLUMN IF NOT EXISTS "builder_pref" text;
