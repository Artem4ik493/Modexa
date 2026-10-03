export const MODEXA_DATABASE_SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(platform, external_id)
);

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'public',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS community_identities (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(platform, external_id)
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, community_id)
);

CREATE TABLE IF NOT EXISTS system_roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS system_role_permissions (
  role_id TEXT NOT NULL REFERENCES system_roles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY(role_id, permission)
);

CREATE TABLE IF NOT EXISTS user_system_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES system_roles(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, role_id)
);

CREATE TABLE IF NOT EXISTS community_roles (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE(community_id, name)
);

CREATE TABLE IF NOT EXISTS community_role_permissions (
  role_id TEXT NOT NULL REFERENCES community_roles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY(role_id, permission)
);

CREATE TABLE IF NOT EXISTS user_community_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES community_roles(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, role_id)
);

CREATE TABLE IF NOT EXISTS moderation_cases (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT NOT NULL REFERENCES users(id),
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  community_external_id TEXT NOT NULL,
  user_external_id TEXT NOT NULL,
  duration_seconds INTEGER,
  reason TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_moderation_cases_community_created
  ON moderation_cases(community_id, created_at DESC);

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bridge_endpoints (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  community_external_id TEXT NOT NULL,
  community_name TEXT NOT NULL,
  channel_external_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  community_id TEXT,
  channel_id TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(platform, community_external_id, channel_external_id)
);

CREATE TABLE IF NOT EXISTS bridge_links (
  id TEXT PRIMARY KEY,
  source_endpoint_id TEXT NOT NULL REFERENCES bridge_endpoints(id) ON DELETE CASCADE,
  target_endpoint_id TEXT NOT NULL REFERENCES bridge_endpoints(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;
