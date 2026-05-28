# Contributing

Cockpit is optimized for clear ownership, tight feedback loops, and production
trust. Changes should be small enough to review and strong enough to ship.

## Before Editing

Read:

- `README.md`
- `CLAUDE.md`
- `docs/architecture-first-principles.md`
- relevant domain files in `src/db/schema`, `src/db/queries`, and
  `src/components`

## Engineering Standards

- Keep source-of-truth boundaries intact.
- Prefer existing primitives, hooks, API helpers, and `ui-*` classes.
- Add abstractions only when they remove real duplication or clarify ownership.
- Validate API inputs at the route boundary.
- Preserve user/tenant scoping in database queries.
- Do not introduce raw design values in JSX.
- Keep local-runtime behavior behind daemon/bridge contracts.

## Required Checks

Run the relevant subset while developing. Before pushing a broad change, run:

```bash
npx tsc --noEmit
npm run lint
npm run check:design
npm run test:control-presenter
npm run test:home
npm run test:db-url
npm run test:orchestration-summary
npm run build
npm run smoke
```

## Pull Requests

A good PR explains:

- what changed
- why the change matters
- how it was verified
- any production or migration steps
- remaining risks or follow-up work

Do not hide known risk in a summary. Put it directly in the PR.
