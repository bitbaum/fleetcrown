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

## Verifying it still holds

`npx tsx scripts/test/repo-delete-capability.ts` pins both halves: the refusal
stays actionable, and no UI reintroduces the button that would always fail.
`bash scripts/hetzner/test-retire-site.sh` covers the retire modes.
