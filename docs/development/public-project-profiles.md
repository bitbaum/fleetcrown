# Public project development profiles

`/fleet/[slug]` renders the existing public fleet map for one registered project.
It shows the four identity attributes, stack, public destinations, roadmap and
changelog. The page reads `loadFleetMap`; it does not maintain a second portfolio
or retrieve private project fields. Missing context stays explicitly missing.

The fleet listing links project names to this public route. Authenticated project
workspace links remain available through the Loki presence link. The profile's
Loki investigation action uses `fleetSurfaceHref('chat', slug)` and leads to the
signed-in workspace; public access does not grant project execution permissions.

Added for the Substrata research-service work on 2026-09-16. Validation: full
`pnpm run verify` passed, including 181 unit-test files and operational gates.
Deployment verification belongs in Substrata's implementation ledger until the
cross-product rollout is complete.
