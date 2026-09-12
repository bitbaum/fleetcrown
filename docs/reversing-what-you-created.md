# Reversing what you created

Creating a project in FleetCrown can produce five things that outlive the click:
a GitHub repository, a checkout on the box, a systemd service, a public address
in Caddy, and a row in the apps register. Anything a product creates, it must be
able to undo — otherwise "try it and see" is a trap. This is the map of what
undoes what, and what each step costs.

## The controls

| Control | Where | Undoes | Recoverable? |
| --- | --- | --- | --- |
| Take it down | Project → OrangeCat publish button | The public OrangeCat listing (status → draft) | Yes, republish |
| Retire → offline | Project settings → site | Stops the service, removes the public address | Yes, `--mode restore` |
| Retire → private | Project settings → site | As offline, and makes the repository private | Yes, `--mode restore` |
| Retire → delete | Project settings → site | Service, files, vhost, port and register row | **No** on the box; the repo is archived, not deleted |
| Archive repository | Project settings → delete project | Makes the repository read-only | Yes, unarchive on GitHub |
| Delete project | Project settings → delete project | Brief, goals, state and queued work | **No** |

Each destructive control is gated the same way: a plan first, then typing the
project's own name. An armed button is a reflex; typing a name is a decision.

## The one thing FleetCrown cannot do

**It cannot delete a GitHub repository, and that is deliberate.** Neither the
org token nor a user's OAuth grant asks for GitHub's `delete_repo` scope, so no
credential this product holds can irreversibly destroy someone's code — not
through a bug, not through a compromised session, not through a mis-click.

So the teardown UI does not offer it. It archives, which is recoverable, and
links to the repository's own Settings page on GitHub, where the owner can
delete it with rights the app never borrows.

If a delete is attempted through the API anyway, the refusal names the missing
scope, lists what the token does have, and gives the GitHub URL. It never
echoes a bare `403 Must have admin rights to Repository`, which is true but
tells nobody what to do next.

Granting the scope is possible (`gh auth refresh -s delete_repo` on the box)
but it is a standing risk in exchange for a step that takes two clicks on
GitHub, so the default stays as it is.

## Clean up the test when the test is over

**An experiment must not outlive the experiment.** Anything spun up to prove
something — a dogfood site, a site-factory run, an end-to-end probe — is torn
down in the same session that created it, including its GitHub repository. Not
archived, not left private: gone.

This is not tidiness. On 2026-09-12 six such sites were still live days later,
five with repositories behind them, and two of them —
"Velokiosk — Bike Repair at Zürich HB" and "Kaffeeklappe – Kaffee to go in
Zürich Wiedikon" — read as real Zurich businesses that do not exist, on the
founder's own domain. Nobody decided to keep them; they were just never
removed. The GitHub account becomes unreadable at a glance, the register stops
meaning "things we run", and every agent that reads either infers that
half-finished experiments are normal here.

The cleanup, in full:

```bash
# on the box — service, files, vhost, port, register row, workflows
bash scripts/hetzner/retire-site.sh <name> --mode delete --repo keep --go

# from a machine whose token has delete_repo (the box's deliberately does not)
gh repo delete bitbaum/<name> --yes

# and in the repo, in the same commit
#   remove the row from scripts/hetzner/apps.conf
```

`pnpm run check:no-experiment-litter` fails the build if a generated throwaway
name is ever committed to the register, so forgetting is caught rather than
discovered months later.

## Verifying it still holds

`npx tsx scripts/test/repo-delete-capability.ts` pins both halves: the refusal
stays actionable, and no UI reintroduces the button that would always fail.
`bash scripts/hetzner/test-retire-site.sh` covers the retire modes, and
`bash scripts/test/experiment-litter-gate.sh` covers the litter gate — both
that it fires on every throwaway shape and that it never flags a real product.
