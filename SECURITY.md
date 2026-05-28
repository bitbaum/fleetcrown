# Security Policy

Cockpit is a hybrid system: the hosted app stores account, project, and product
state; the local daemon executes terminal, git, and agent work on the user's
machine. Security work should preserve that boundary.

## Supported Surface

- Production app: `https://cockpitapp.vercel.app`
- Default branch: `main`
- Runtime bridge: per-user `ck_*` agent tokens
- Database: PostgreSQL through direct and pooled URLs

## Reporting

This is a private repository. Report suspected vulnerabilities directly to the
repo owner with:

- affected route, component, script, or workflow
- reproduction steps
- impact and required privileges
- whether the issue affects hosted cloud, local daemon, or both

Do not include real secrets, production tokens, or personal user data in reports.

## Security Expectations

- No secrets in Git. Use `.env.example` as the public contract.
- Validate all API input with zod or explicit route guards.
- Keep shell execution behind trusted server/runtime boundaries.
- Never pass user-derived strings to `runTool` or shell commands without a
  specific parser/escaping strategy.
- Prefer per-user `ck_*` agent tokens over shared daemon tokens.
- Shared daemon tokens require explicit server-side opt-in.
- Preserve tenant scoping on every persisted runtime and project-state write.
- Treat the local daemon as powerful: it can access the user's terminal and
  filesystem through intended workflows.

## Dependency Hygiene

GitHub Actions runs a scheduled `npm audit --audit-level=high`. High and
critical vulnerabilities must be fixed or explicitly documented before a release.
Moderate dev-tool findings can be deferred only when they are not reachable in
production runtime paths.
