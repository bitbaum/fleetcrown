ALTER TABLE runtime_snapshots
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'local';

ALTER TABLE runtime_snapshots
  DROP CONSTRAINT IF EXISTS runtime_snapshots_pkey;

ALTER TABLE runtime_snapshots
  ADD CONSTRAINT runtime_snapshots_pkey PRIMARY KEY (user_id, channel);

