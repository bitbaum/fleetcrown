# Apply guide — blast-radius containment (#1) + CI-gated deploy (#2)

Both are prepared on branch `chore/prep-blast-radius-and-ci-deploy` and are
**inert until you apply them**. Neither changes anything on merge except #2's
workflow (see the double-deploy warning). Apply while watching the box.

---

## #1 — Contain the box-runner blast radius

**Problem:** the box-runner runs as `ubuntu` and spawns agent PTYs. `ubuntu` owns
every co-tenant app's `.env` under `/opt/*` and the box SSH keys, so a
prompt-injected agent could read every product's secrets.

**Fix:** a systemd drop-in makes those paths kernel-inaccessible to the runner
*and every PTY it spawns*. It does **not** change the user (the `claude` CLI
lives in `/home/ubuntu`, so a user migration would need CLI relocation — this
delivers the containment now). Safe because the runner only touches its own dir,
fresh clones under `/home/ubuntu/dev`, and system bins — never another `/opt/<app>`
(verified in `src/lib/agent-execution/box-workspace.ts`).

```bash
# Preview the exact drop-in:
bash scripts/hetzner/harden-box-runner.sh --dry-run

# Apply (installs drop-in, restarts, proves a co-tenant .env is now unreadable):
bash scripts/hetzner/harden-box-runner.sh

# VERIFY it still works: dispatch a small task from /control to a project and
# confirm the runner clones + runs it:
ssh root@167.233.22.31 journalctl -u fleetcrown-box-runner -f

# Roll back instantly if anything breaks:
bash scripts/hetzner/harden-box-runner.sh --revert
```

Fresh box-runner installs get the same containment automatically
(`install-box-runner.sh` now bakes it into the unit).

**Stronger version — dedicated `fcrunner` user** (`migrate-box-runner-to-fcrunner.sh`):
runs the box-runner as an unprivileged `fcrunner` that owns only its own dir, and
hides *all* of `/home/ubuntu` + every co-tenant `/opt/<app>`. More invasive than
the drop-in (it copies the `claude` CLI + its auth to the new home), so treat it
as the thorough follow-up once the drop-in is proven.

```bash
bash scripts/hetzner/migrate-box-runner-to-fcrunner.sh --dry-run   # print the plan
bash scripts/hetzner/migrate-box-runner-to-fcrunner.sh             # apply
# THEN set FLEETCROWN_RUNNER_OWNER=fcrunner in the deploy env (push-deploy hook)
# or the next deploy chowns the runner dir back to ubuntu.
bash scripts/hetzner/migrate-box-runner-to-fcrunner.sh --revert    # roll back
```

Verify after applying: dispatch a task and confirm the agent **authenticates**
under the new home (the one real risk is claude auth surviving the home copy —
the script prints the exact creds-copy fallback if it doesn't). `deploy-hetzner.sh`
and `install-box-runner.sh` now honor `FLEETCROWN_RUNNER_OWNER` (default `ubuntu`).

---

## #2 — Make CI the deploy gate

**Problem:** the deploy fires from the local `.husky/pre-push` hook, so a red CI
still ships and `--no-verify` skips every gate.

**Fix:** `.github/workflows/deploy.yml` runs **only** after the CI workflow
succeeds on `main`, then builds and ships via the existing
`deploy-hetzner.sh --no-build` (so all the flock / rollback / verify logic
carries over). A red CI → no deploy. This works with direct pushes to main
(unlike branch protection).

### Enable steps (in order)

1. **Add the deploy key** — repo → Settings → Secrets and variables → Actions:
   - Secret `HETZNER_SSH_KEY` = a private key whose public half is in the box's
     `root` `~/.ssh/authorized_keys` (mint a deploy-only key, don't reuse a personal one).
   - (optional) Variable `HETZNER_IP` (defaults to `167.233.22.31`).
2. **Disable the local hook** (or you deploy twice): comment out the
   `>>> fleetcrown push-deploy >>>` block in `.husky/pre-push`.
3. **Merge this branch to main.** The workflow activates on the next CI-green run.
4. **Watch the first run's "Build" step.** It builds against a schema-only
   Postgres (via `drizzle-kit push`, no seed). If a page pre-renders off real
   data and the build fails, add a minimal seed step to `deploy.yml`.

### Rollback
Re-enable the `.husky/pre-push` block and delete `.github/workflows/deploy.yml`
(or disable it in the Actions tab).

### Optional extra layer — branch protection
`deploy.yml` alone already means "red CI can't ship." If you also want to stop a
red commit from landing on main at all:

```bash
bash scripts/setup-branch-protection.sh          # requires the CI 'check' job to pass
bash scripts/setup-branch-protection.sh --remove # undo
```

⚠️ This **rejects direct pushes to main** — you'd move to a PR-based flow. Skip
it if you push to main directly; the deploy gate is enough.
