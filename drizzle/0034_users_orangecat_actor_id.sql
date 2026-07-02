-- "Login with OrangeCat" (cross-product identity bridge, Part A):
-- the linked OrangeCat actor (= OIDC id_token.sub). One OC actor maps to at
-- most one FleetCrown user, hence the unique constraint (nullable-unique is
-- fine in Postgres — unlinked users stay NULL).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS orangecat_actor_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS users_orangecat_actor_id_unique
  ON users (orangecat_actor_id)
  WHERE orangecat_actor_id IS NOT NULL;
