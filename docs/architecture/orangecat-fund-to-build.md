# OrangeCat fund-to-build bridge

OrangeCat is the public economic surface; FleetCrown is the supervised
production surface. The bridge connects them without merging their security
boundaries.

## Contract

- OrangeCat signs a ten-minute HS256 build intent containing the owner actor,
  source entity, canonical URL, public description, and a generic Loki handoff.
- FleetCrown requires an OIDC-linked OrangeCat actor matching the intent `sub`.
- Each intent `jti` is stored and can be consumed once.
- The owner reviews the proposed context and chooses a new or existing
  FleetCrown project.
- `orangecat_entity_links` stores typed many-to-many edges: `origin`,
  `public_profile`, `funding`, `offering`, and `community`.
- `user_projects.orangecat_project_id` remains during compatibility migration.
- Funding is read-only context in FleetCrown. It never dispatches an agent.

## Bitcoin settlement boundary

OrangeCat sends a funding event only after the payment intent is `paid`.
FleetCrown verifies the shared webhook HMAC and deduplicates on the OrangeCat
payment-intent ID. The public funding summary is ledger-derived and excludes
created, invoice-ready, acknowledged, expired, and failed intents.

## Operations

Use the founder acceptance flow in OrangeCat's
`docs/integrations/fund-to-build-dogfood.md`. Required secrets and canonical
entity IDs are documented in both `.env.example` files.

Fiat, privacy coins, smart contracts, full Nostr identity, milestone-driven
work orders, and automatic dispatch are roadmap work, not current behavior.
