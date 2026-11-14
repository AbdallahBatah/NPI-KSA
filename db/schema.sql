CREATE TABLE IF NOT EXISTS npi_users (
  id text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  role text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  must_change boolean NOT NULL DEFAULT false,
  pw_algo text NOT NULL,
  pw_salt text NOT NULL,
  pw_hash text NOT NULL,
  last_login timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS npi_records (
  collection text NOT NULL,
  id text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, id)
);

CREATE INDEX IF NOT EXISTS npi_records_collection_idx ON npi_records (collection);

CREATE TABLE IF NOT EXISTS npi_sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES npi_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS npi_sessions_expiry_idx ON npi_sessions (expires_at);
