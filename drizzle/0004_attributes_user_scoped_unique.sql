-- Tighten the attributes uniqueness so two tenants can store the same
-- (entity_id, key) without colliding. user_id is included to make the unique
-- constraint match the way upsertEntityAttribute already scopes ownership.
DROP INDEX IF EXISTS "uq_attributes_entity_key";

CREATE UNIQUE INDEX IF NOT EXISTS "uq_attributes_user_entity_key"
  ON "attributes" ("user_id", "entity_id", "key");
