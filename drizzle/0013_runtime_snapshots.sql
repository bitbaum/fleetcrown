-- Runtime snapshot: full Zellij tab list pushed by local daemon for cloud control plane.
CREATE TABLE IF NOT EXISTS runtime_snapshots (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  open_tabs text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
