/**
 * Declarative schema: the desired end state, applied idempotently on every boot.
 *
 * There is no ordered migration list. Every statement is written so that
 * re-running it is a no-op, which makes the schema converge from any prior
 * version (including a partially applied one) without a version table.
 */
export const SCHEMA_STATEMENTS: readonly string[] = [
  "CREATE TABLE IF NOT EXISTS setup_lock (id int PRIMARY KEY)",
  "CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY, username text NOT NULL UNIQUE, email text UNIQUE, role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')), password_hash text, device_key_hash text NOT NULL, device_username text, oidc_issuer text, oidc_subject text, disabled boolean NOT NULL DEFAULT false, email_verified boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now())",
  'CREATE TABLE IF NOT EXISTS sessions (id text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL)',
  'CREATE TABLE IF NOT EXISTS devices (id text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, name text NOT NULL, platform text, version text, role text NOT NULL, identity_key text NOT NULL, revoked boolean NOT NULL DEFAULT false, last_seen_at timestamptz, device_key_id text, created_at timestamptz NOT NULL DEFAULT now())',
  "CREATE TABLE IF NOT EXISTS device_tokens (id text PRIMARY KEY, device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind text NOT NULL CHECK (kind IN ('access','refresh')), expires_at timestamptz NOT NULL, used boolean NOT NULL DEFAULT false, recovery_nonce text, recovery_access_expires timestamptz, recovery_expires timestamptz)",
  'CREATE TABLE IF NOT EXISTS device_keys (id text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, label text NOT NULL, key_hash text NOT NULL, revoked boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz)',
  'CREATE TABLE IF NOT EXISTS email_codes (id text PRIMARY KEY, email text NOT NULL, purpose text NOT NULL, code_hash text NOT NULL, expires_at timestamptz NOT NULL, attempts int NOT NULL DEFAULT 0, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())',
  'CREATE TABLE IF NOT EXISTS server_settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())',
  'CREATE TABLE IF NOT EXISTS audit_log (id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), user_id uuid, actor text, action text NOT NULL, detail jsonb)',

  // Additive convergence for databases created by an earlier version.
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS email text',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS device_username text',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS oidc_issuer text',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS oidc_subject text',
  'ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_key_id text',
  'ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS recovery_expires timestamptz',

  // Indexes: names are stable so IF NOT EXISTS converges.
  'CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (email)',
  'CREATE UNIQUE INDEX IF NOT EXISTS users_device_username_idx ON users (device_username)',
  'CREATE UNIQUE INDEX IF NOT EXISTS users_oidc_idx ON users (oidc_issuer, oidc_subject)',
  'CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)',
  'CREATE INDEX IF NOT EXISTS devices_user_idx ON devices (user_id)',
  'CREATE INDEX IF NOT EXISTS tokens_device_idx ON device_tokens (device_id)',
  'ALTER TABLE device_keys ADD COLUMN IF NOT EXISTS secret text',
  'CREATE INDEX IF NOT EXISTS device_keys_user_idx ON device_keys (user_id)',
  'CREATE INDEX IF NOT EXISTS email_codes_lookup_idx ON email_codes (email, purpose)',
  'CREATE INDEX IF NOT EXISTS email_codes_created_idx ON email_codes (email, created_at)',
  'CREATE INDEX IF NOT EXISTS audit_at_idx ON audit_log (at)',
]

/** Rows that can be normalised without violating a unique index. */
export const SCHEMA_NORMALISE: readonly string[] = [
  "UPDATE users SET email = lower(email) WHERE email IS NOT NULL AND email <> lower(email)",
  "UPDATE users SET username = lower(username) WHERE username <> lower(username)",
]
