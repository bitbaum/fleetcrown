-- Migration: canonical identity for the fleet register.
--
-- user_projects gains the three links the register joins on. All nullable and
-- additive: existing rows are untouched until scripts/backfill-project-registry.ts
-- assigns slugs, and a concurrent deploy of older code never sees a column it
-- does not expect to be required.
--
--   slug           the repository name — the ONE key every register uses
--   hosted_app     the apps.conf row that serves it (null = not hosted)
--   solon_org_slug the Solon organisation governing it (null = none)
--
-- Uniqueness on slug where set: two projects with one identity is the exact
-- confusion this column exists to end. Postgres treats NULLs as distinct, so
-- unassigned rows do not collide.

ALTER TABLE "user_projects" ADD COLUMN IF NOT EXISTS "slug" text;
ALTER TABLE "user_projects" ADD COLUMN IF NOT EXISTS "hosted_app" text;
ALTER TABLE "user_projects" ADD COLUMN IF NOT EXISTS "solon_org_slug" text;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_projects_slug" ON "user_projects" ("slug");
