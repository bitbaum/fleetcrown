# Database Migration Strategy — Proposal

> **Status:** PROPOSAL awaiting owner decision. Nothing in this document is
> implemented by adding it. It describes current behavior, the residual risk,
> and a recommended hardening. Migrating the mechanism is a deliberate change
> the owner should approve.

## TL;DR

The **production deploy is already safe** — it does **not** run `drizzle-kit push`
against the box. It applies versioned migration **files** forward-only through a
guarded applier that refuses destructive statements and rolls back on drift.

The residual risk is **ergonomic, not the deploy path**: `npm run migrate` is
still aliased to `drizzle-kit push`, and `CLAUDE.md` documents `drizzle-kit push`
as "the" schema command. That trains a habit (and an agent muscle-memory) that
can diff-apply an unreviewed schema straight to prod if `DATABASE_URL` happens to
point at the box, and it lets schema changes exist without a reviewable migration
file. The recommendation is to demote `push` to a local-scratch-only tool and
make the generate → review → forward-apply loop the single documented path.

---

## 1. Current behavior (verified)

### 1a. Where `drizzle-kit push` actually runs today

| Location | Target DB | Prod risk? |
|---|---|---|
| `package.json` → `"migrate": "drizzle-kit push"` | Whatever `DATABASE_URL` is set to | **Yes, if pointed at the box.** This is the footgun. |
| `.github/workflows/deploy.yml` line 73 | Ephemeral CI Postgres service (`postgres:ci@localhost:5432`) | No — throwaway DB, exists only so `npm run build` can static-pre-render. |
| `docker-compose.yml` line 24 | Local dev container Postgres | No — local only. |
| `CLAUDE.md` → "Schema push: `DATABASE_URL=… npx drizzle-kit push`" | Documentation | Indirect — it teaches `push` as the normal workflow. |

**`drizzle-kit push` is NOT in the production deploy path.** The premise that
"the deploy auto-pushes unreviewed schema to prod" is stale — that gap was
already closed (see the roadmap note: "ledger-based, never `drizzle-kit push`").

### 1b. What the production deploy actually does

`scripts/deploy-hetzner.sh` (invoked by the CI **Deploy** workflow after a green
CI, and by the local push-deploy hook) applies schema **before** shipping code via:

```
scripts/hetzner/apply-schema.sh fleetcrown <repo> fleetcrown .
```

That shared applier is already the safe pattern:

- **Forward-only ledger.** Applies only migration files not yet recorded in
  `public._deploy_schema_history`. First run **baselines** the existing file set
  as already-applied (prod assumed at tip), applying nothing.
- **Refuses destructive diffs.** Any pending migration containing
  `DROP TABLE | DROP COLUMN | DROP SCHEMA | TRUNCATE | DELETE FROM | ALTER COLUMN … TYPE`
  **aborts the whole deploy** — an automated deploy can never silently drop or
  rewrite prod data.
- **All-or-nothing.** The pending batch runs in a single transaction.
- **Idempotent.** Rewrites `ADD COLUMN` → `ADD COLUMN IF NOT EXISTS`; drizzle's
  own `CREATE … IF NOT EXISTS` guards cover the rest.
- **Post-apply drift gate + rollback.** `deploy-hetzner.sh` then diffs
  schema-declared tables/columns (`scripts/check-schema-drift.ts --print`)
  against the live box. Any missing object → the deploy **rolls back** to the
  last-good build and alerts, rather than serve a half-broken app.

The Drizzle setup that feeds this:

- **Schema (SSOT):** `src/db/schema/` (`drizzle.config.ts` → `schema`).
- **Migration files (out):** `drizzle/` (`0001_*.sql` … `0039_*.sql`).
- **Meta:** `drizzle/meta/_journal.json` + `0039_snapshot.json` — a current
  snapshot exists, so `npm run db:generate` diffs against it and emits the next
  `0040+` migration automatically.
- **Ledger bootstrap:** `scripts/db/bootstrap-migration-ledger.ts` reconciles
  drizzle's native `drizzle.__drizzle_migrations` ledger from existing schema —
  see §3.

**Net:** the deploy path already realizes the recommended "generate files →
apply forward-only, guarded" model. The applier is the `migrate deploy`
equivalent, filename+ledger-based (immune to journal/snapshot state).

### 1c. The parallel raw-SQL path (`scripts/db/migrations/`)

Not every migration lives in `drizzle/`. The two most recent
(`scripts/db/migrations/074_*.sql`, `075_*.sql`) are hand-written raw SQL applied
**manually** via `npm run db:apply-box -- <file>` — which SSHes to the box and
runs the file **as the app role** (so created objects are owned by `fleetcrown`
and stay visible to the app; applying as `postgres` is the owner/grant footgun
that has cost rollbacks before). `apply-schema.sh` reads only `<repo>/drizzle`,
so it does **not** pick these up. Consequence: a raw-SQL migration must be
applied to the box (and to local dev) **before** its code reaches `main`, or the
post-deploy drift-gate sees the declared-but-missing table and **rolls back**.

This split — some schema in `drizzle/`, the newest in `scripts/db/migrations/` —
is itself part of what this proposal wants to reconcile: one documented,
reviewable, forward-applied path. Until then, raw-SQL migrations are correct only
when hand-applied via `db:apply-box` ahead of the deploy.

---

## 2. Why `drizzle-kit push` is the wrong default (the residual risk)

`drizzle-kit push` diffs the live DB against the schema and applies the diff
**in place, immediately, with no artifact**:

- **Destructive by inference, no review.** If a column is renamed or a table
  restructured, `push` can decide the "shortest diff" is `DROP` + recreate —
  silently discarding data. There is no file to read in a PR, no diff to approve,
  no record of what ran.
- **No rollback point.** Because nothing is versioned, you cannot revert to
  "schema at commit X." Recovery means a restore from backup.
- **Environment-coupled.** `push` does exactly what its `DATABASE_URL` says.
  `npm run migrate` with a box URL in the shell = unreviewed prod DDL. This is
  the single realistic route by which FleetCrown could still auto-mutate prod.
- **Schema can exist with no migration file.** A change applied by `push` never
  produces a `drizzle/NNNN_*.sql`. It won't be in the reviewed PR, and it won't
  ship through `apply-schema.sh` — the deploy drift-gate would then **roll back**
  (a late, noisy failure for what should have been a reviewed file).

So even though the deploy is safe, `push`-first ergonomics keep a foot near the
trigger and route schema changes around review.

---

## 3. Recommended pattern (Drizzle forward-only, versioned)

Make the following the **one** documented schema workflow. Most of it already
exists; the change is making it the default and demoting `push`.

### The loop

1. **Edit schema** in `src/db/schema/`.
2. **Generate a versioned migration file:**
   ```bash
   npm run db:generate           # drizzle-kit generate → drizzle/NNNN_*.sql
   ```
3. **Review the generated SQL in the PR.** This is the gate — a human (and CI)
   reads the DDL before it can reach any environment. Destructive statements are
   visible here, not discovered in prod.
4. **Apply forward-only on deploy** — already done by `apply-schema.sh` inside
   `deploy-hetzner.sh` (the `drizzle-kit migrate` / `migrate deploy` equivalent,
   with the destructive-refusal guard on top). No manual step.

### Guarding destructive statements

`apply-schema.sh` already **refuses** a pending migration that contains a
destructive statement and aborts the deploy. When a destructive change is
genuinely intended, do it deliberately and out-of-band:

1. Write the migration file as usual (so the intent is in the PR and reviewed).
2. Apply it **by hand** against the box during a maintenance window:
   ```bash
   ssh <box> "sudo -u postgres psql -d fleetcrown -f - < 00NN_migration.sql"
   ```
3. Record the tag so the automated applier skips it:
   ```bash
   ssh <box> "sudo -u postgres psql -d fleetcrown \
     -c \"INSERT INTO public._deploy_schema_history(tag) VALUES ('00NN_xxx')\""
   ```

This keeps "the automated deploy never runs a `DROP`" as an invariant while
still allowing intentional, reviewed, supervised destructive changes.

### Proposed script / doc changes (owner to approve — NOT applied here)

Small, mechanical, close the footgun:

- **`package.json`:** rename `"migrate": "drizzle-kit push"` →
  `"db:push": "drizzle-kit push"` and reserve `"db:migrate"` for the
  forward-only applier. Rationale: nothing safe should be named `migrate` while
  meaning `push`; the name is the trap.
- **`CLAUDE.md` → Database section:** replace "Schema push: `… drizzle-kit push`"
  with the generate → review → forward-apply loop above, and state explicitly:
  **`drizzle-kit push` is for a throwaway local/scratch DB only — never a shared
  or production database.**
- **(optional) CI guard:** a check that fails a PR which changed
  `src/db/schema/` but produced no new `drizzle/NNNN_*.sql` — closes the
  "schema change with no reviewable file" class permanently (Never-Twice rule).

---

## 4. Migration path from the current `push` baseline

The hard part — "the first generated migration tries to recreate everything" —
is **already solved** in this repo; this section records it so it isn't redone.

1. **Baseline the file ledger (prod).** `apply-schema.sh`'s first run against a
   `push`-provisioned DB inserts the current `drizzle/*.sql` set into
   `public._deploy_schema_history` as already-applied and applies nothing. This
   already happened on the box; new deploys only apply genuinely-new files.
2. **Baseline drizzle's native ledger (optional).** If you want
   `drizzle-kit migrate` itself (not just `apply-schema.sh`) to be usable,
   `scripts/db/bootstrap-migration-ledger.ts` writes
   `drizzle.__drizzle_migrations` + `drizzle/meta/_journal.json` from the
   existing files so `migrate` treats them as applied instead of re-running them:
   ```bash
   npx tsx scripts/db/bootstrap-migration-ledger.ts --dry-run      # inspect
   npx tsx scripts/db/bootstrap-migration-ledger.ts --write-journal # journal only
   DATABASE_URL=<box> npx tsx scripts/db/bootstrap-migration-ledger.ts --apply
   ```
3. **Snapshot is current.** `drizzle/meta/0039_snapshot.json` matches the live
   schema, so `npm run db:generate` produces a correct incremental `0040+` diff —
   not a from-scratch recreate.

**No re-baselining needed.** The one behavioral change to adopt is discipline +
naming: generate a file for every schema change, review it, let the deploy apply
it — and stop reaching for `push` against anything shared.

---

## 5. Summary

| Concern | Status |
|---|---|
| Prod deploy auto-runs `drizzle-kit push` | **No** — uses forward-only `apply-schema.sh`. |
| Destructive diff can ship automatically | **No** — refused + deploy aborts. |
| Rollback on schema drift | **Yes** — post-apply gate rolls back. |
| Versioned migration files reviewed in PR | Partially — files exist; making `generate` the *required*, `push` the *forbidden-on-shared* path is the gap. |
| `npm run migrate` = `drizzle-kit push` footgun | **Open** — recommend rename + doc fix (§3). |
| First-migration recreate problem | **Solved** — ledger baselined; snapshot current (§4). |

The deploy mechanism is sound and should **not** be changed. The proposal is to
finish the job at the ergonomics layer: rename the `push` script, correct the
docs, and (optionally) add a CI guard so a schema change without a reviewable
file can't merge.
