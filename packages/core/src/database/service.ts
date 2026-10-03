import {
  randomUUID
} from "node:crypto";

import {
  mkdirSync
} from "node:fs";

import {
  dirname
} from "node:path";

import {
  readFileSync
} from "node:fs";

import {
  DatabaseSync
} from "node:sqlite";

import {
  MODEXA_OWNER_ROLE,
  type Permission,
  type SystemRole
} from "../access/index.js";

import {
  MODEXA_DATABASE_SCHEMA
} from "./schema.js";

import type {
  BridgeEndpoint,
  BridgeLink
} from "../bridge/types.js";

import type {
  AuditAction
} from "../audit/service.js";

import type {
  ModerationCase,
  ModerationCaseStatus,
  ModerationActionType
} from "../moderation/types.js";

export interface DatabaseOptions {
  path: string;
}

export interface PersistedUser {
  id: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PersistedIdentity {
  id: string;
  userId: string;
  platform: "telegram" | "discord";
  externalId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ModexaDatabase {

  readonly path: string;
  private readonly database: DatabaseSync;

  constructor(options: DatabaseOptions) {
    this.path = options.path;
    mkdirSync(dirname(options.path), {
      recursive: true
    });

    this.database =
      new DatabaseSync(options.path);

    this.database.exec("PRAGMA busy_timeout = 5000;");
    this.database.exec("PRAGMA journal_mode = WAL;");

    this.database.exec(
      MODEXA_DATABASE_SCHEMA
    );

    this.ensureMigrations();
    this.migrateLegacyUserIds();

    this.seedSystemRole(
      MODEXA_OWNER_ROLE
    );
  }

  exportSnapshot(): string {
    return readFileSync(this.path).toString("base64");
  }


  getCommunityIdentitiesSnapshot(communityId?: string): Array<{
    id: string;
    communityId: string;
    platform: "telegram" | "discord";
    externalId: string;
    name?: string;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const rows = this.database.prepare(
      `SELECT id, community_id, platform, external_id, name, created_at, updated_at
       FROM community_identities
       WHERE (? IS NULL OR community_id = ?)
       ORDER BY id`
    ).all(communityId ?? null, communityId ?? null) as Array<{
      id: string;
      community_id: string;
      platform: "telegram" | "discord";
      external_id: string;
      name: string | null;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      communityId: row.community_id,
      platform: row.platform,
      externalId: row.external_id,
      name: row.name ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  getMembershipsSnapshot(communityId?: string): Array<{
    id: string;
    userId: string;
    communityId: string;
    status: "active" | "left" | "banned";
    joinedAt: Date;
    updatedAt: Date;
  }> {
    const rows = this.database.prepare(
      `SELECT id, user_id, community_id, status, joined_at, updated_at
       FROM memberships
       WHERE (? IS NULL OR community_id = ?)
       ORDER BY id`
    ).all(communityId ?? null, communityId ?? null) as Array<{
      id: string;
      user_id: string;
      community_id: string;
      status: "active" | "left" | "banned";
      joined_at: string;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      communityId: row.community_id,
      status: row.status,
      joinedAt: new Date(row.joined_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  appendAudit(entry: {
    id: string;
    communityId: string;
    action: AuditAction;
    actorUserId?: string;
    targetUserId?: string;
    channelId?: string;
    messageId?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
  }): void {
    this.database.prepare(
      `INSERT INTO audit_entries
       (id, community_id, action, actor_user_id, target_user_id, channel_id, message_id, reason, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entry.id,
      entry.communityId,
      entry.action,
      entry.actorUserId ?? null,
      entry.targetUserId ?? null,
      entry.channelId ?? null,
      entry.messageId ?? null,
      entry.reason ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.createdAt.toISOString()
    );
  }

  getAuditEntries(communityId: string, limit = 100): Array<{
    id: string;
    communityId: string;
    action: AuditAction;
    actorUserId?: string;
    targetUserId?: string;
    channelId?: string;
    messageId?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
  }> {
    const rows = this.database.prepare(
      `SELECT id, community_id, action, actor_user_id, target_user_id,
              channel_id, message_id, reason, metadata, created_at
       FROM audit_entries
       WHERE community_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    ).all(communityId, Math.max(1, Math.min(500, limit))) as Array<{
      id: string;
      community_id: string;
      action: string;
      actor_user_id: string | null;
      target_user_id: string | null;
      channel_id: string | null;
      message_id: string | null;
      reason: string | null;
      metadata: string | null;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      communityId: row.community_id,
      action: row.action,
      actorUserId: row.actor_user_id ?? undefined,
      targetUserId: row.target_user_id ?? undefined,
      channelId: row.channel_id ?? undefined,
      messageId: row.message_id ?? undefined,
      reason: row.reason ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) as Record<string, unknown> : undefined,
      createdAt: new Date(row.created_at)
    }));
  }

  getCommunitiesSnapshot(): Array<{ id: string; name: string; mode: string; createdAt: Date; updatedAt: Date }> {
    const rows = this.database.prepare(
      "SELECT id, name, mode, created_at, updated_at FROM communities ORDER BY name"
    ).all() as Array<{id:string;name:string;mode:string;created_at:string;updated_at:string}>;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      mode: row.mode,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  getSystemRole(
    roleId: string
  ): SystemRole | undefined {
    const role =
      this.database
        .prepare(
          "SELECT id, name FROM system_roles WHERE id = ?"
        )
        .get(roleId) as
        | {
            id: string;
            name: string;
          }
        | undefined;

    if (!role) {
      return undefined;
    }

    const permissions =
      this.database
        .prepare(
          "SELECT permission FROM system_role_permissions WHERE role_id = ? ORDER BY permission"
        )
        .all(roleId) as Array<{
        permission: string;
      }>;

    return {
      id: role.id,
      name: role.name,
      permissions:
        permissions.map(
          (item) =>
            item.permission as Permission
        )
    };
  }

  getNextUserId(): number {
    const row =
      this.database.prepare(
        `SELECT id FROM users
         ORDER BY CAST(substr(id, 6) AS INTEGER) DESC
         LIMIT 1`
      ).get() as {
        id: string;
      } | undefined;

    if (!row) return 1;

    const value =
      Number(row.id.slice(5));

    return Number.isFinite(value)
      ? value + 1
      : 1;
  }

  getNextIdentityId(): number {
    const row =
      this.database.prepare(
        `SELECT id FROM identities
         ORDER BY CAST(substr(id, 10) AS INTEGER) DESC
         LIMIT 1`
      ).get() as {
        id: string;
      } | undefined;

    if (!row) return 1;

    const value =
      Number(row.id.slice(9));

    return Number.isFinite(value)
      ? value + 1
      : 1;
  }

  createUser(user: PersistedUser): void {
    this.database.prepare(
      `INSERT INTO users
       (id, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?)`
    ).run(
      user.id,
      user.displayName,
      user.createdAt.toISOString(),
      user.updatedAt.toISOString()
    );
  }

  getUser(userId: string): PersistedUser | undefined {
    const row = this.database.prepare(
      `SELECT id, display_name, created_at, updated_at
       FROM users WHERE id = ?`
    ).get(userId) as {
      id: string;
      display_name: string;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      displayName: row.display_name,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  createIdentity(identity: PersistedIdentity): void {
    this.database.prepare(
      `INSERT INTO identities
       (id, user_id, platform, external_id, username, display_name, avatar_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      identity.id,
      identity.userId,
      identity.platform,
      identity.externalId,
      identity.username ?? null,
      identity.displayName ?? null,
      identity.avatarUrl ?? null,
      identity.createdAt.toISOString(),
      identity.updatedAt.toISOString()
    );
  }

  updateIdentityProfile(
    identityId: string,
    username?: string,
    displayName?: string,
    avatarUrl?: string,
    now = new Date()
  ): void {
    this.database.prepare(
      `UPDATE identities
       SET username = ?,
           display_name = ?,
           avatar_url = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(
      username ?? null,
      displayName ?? null,
      avatarUrl ?? null,
      now.toISOString(),
      identityId
    );
  }

  deleteIdentity(identityId: string): void {
    this.database.prepare(
      "DELETE FROM identities WHERE id = ?"
    ).run(identityId);
  }

  upsertBridgeEndpoint(
    endpoint: BridgeEndpoint
  ): void {
    this.database.prepare(
      `INSERT INTO bridge_endpoints
       (id, platform, community_external_id, community_name,
        channel_external_id, channel_name, community_id, channel_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         platform = excluded.platform,
         community_external_id = excluded.community_external_id,
         community_name = excluded.community_name,
         channel_external_id = excluded.channel_external_id,
         channel_name = excluded.channel_name,
         community_id = excluded.community_id,
         channel_id = excluded.channel_id,
         updated_at = excluded.updated_at`
    ).run(
      endpoint.id,
      endpoint.platform,
      endpoint.communityExternalId,
      endpoint.communityName,
      endpoint.channelExternalId,
      endpoint.channelName,
      endpoint.communityId ?? null,
      endpoint.channelId ?? null,
      endpoint.updatedAt.toISOString()
    );
  }

  getBridgeEndpoints(): BridgeEndpoint[] {
    const rows =
      this.database.prepare(
        `SELECT id, platform, community_external_id, community_name,
                channel_external_id, channel_name, community_id, channel_id, updated_at
         FROM bridge_endpoints
         ORDER BY id`
      ).all() as Array<{
        id: string;
        platform: "telegram" | "discord";
        community_external_id: string;
        community_name: string;
        channel_external_id: string;
        channel_name: string;
        community_id: string | null;
        channel_id: string | null;
        updated_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      platform: row.platform,
      communityExternalId: row.community_external_id,
      communityName: row.community_name,
      channelExternalId: row.channel_external_id,
      channelName: row.channel_name,
      communityId: row.community_id ?? undefined,
      channelId: row.channel_id ?? undefined,
      updatedAt: new Date(row.updated_at)
    }));
  }

  upsertBridgeLink(
    link: BridgeLink
  ): void {
    this.database.prepare(
      `INSERT INTO bridge_links
       (id, source_endpoint_id, target_endpoint_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         source_endpoint_id = excluded.source_endpoint_id,
         target_endpoint_id = excluded.target_endpoint_id,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at`
    ).run(
      link.id,
      link.sourceEndpointId,
      link.targetEndpointId,
      link.createdAt.toISOString(),
      link.updatedAt.toISOString()
    );
  }

  getBridgeLinks(): BridgeLink[] {
    const rows =
      this.database.prepare(
        `SELECT id, source_endpoint_id, target_endpoint_id, created_at, updated_at
         FROM bridge_links
         ORDER BY id`
      ).all() as Array<{
        id: string;
        source_endpoint_id: string;
        target_endpoint_id: string;
        created_at: string;
        updated_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      sourceEndpointId: row.source_endpoint_id,
      targetEndpointId: row.target_endpoint_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  deleteBridgeLink(
    linkId: string
  ): void {
    this.database.prepare(
      "DELETE FROM bridge_links WHERE id = ?"
    ).run(linkId);
  }

  getIdentityByExternalId(
    platform: "telegram" | "discord",
    externalId: string
  ): PersistedIdentity | undefined {
    const row = this.database.prepare(
      `SELECT id, user_id, platform, external_id, username, display_name, avatar_url, created_at, updated_at
       FROM identities
       WHERE platform = ? AND external_id = ?
       LIMIT 1`
    ).get(platform, externalId) as {
      id: string;
      user_id: string;
      platform: "telegram" | "discord";
      external_id: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      userId: row.user_id,
      platform: row.platform,
      externalId: row.external_id,
      username: row.username ?? undefined,
      displayName: row.display_name ?? undefined,
      avatarUrl:
        (row.avatar_url as string | null) ??
        undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  findUsersByUsername(
    username: string,
    platform?: "telegram" | "discord"
  ): Array<{
    user: PersistedUser;
    identity: PersistedIdentity;
  }> {
    const rows =
      this.database.prepare(
        `SELECT
           u.id AS user_id,
           u.display_name AS user_display_name,
           u.created_at AS user_created_at,
           u.updated_at AS user_updated_at,
           i.id AS identity_id,
           i.user_id,
           i.platform,
           i.external_id,
           i.username,
           i.display_name,
           i.avatar_url,
           i.created_at,
           i.updated_at
         FROM identities i
         INNER JOIN users u ON u.id = i.user_id
         WHERE lower(i.username) = ?
           AND (? IS NULL OR i.platform = ?)
         ORDER BY i.id`
      ).all(
        username.toLowerCase(),
        platform ?? null,
        platform ?? null
      ) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      user: {
        id: row.user_id as string,
        displayName:
          row.user_display_name as string,
        createdAt:
          new Date(
            row.user_created_at as string
          ),
        updatedAt:
          new Date(
            row.user_updated_at as string
          )
      },
      identity: {
        id: row.identity_id as string,
        userId: row.user_id as string,
        platform:
          row.platform as
            | "telegram"
            | "discord",
        externalId:
          row.external_id as string,
        username:
          (row.username as string | null) ??
          undefined,
        displayName:
          (row.display_name as string | null) ??
          undefined,
        avatarUrl:
          (row.avatar_url as string | null) ??
          undefined,
        createdAt:
          new Date(
            row.created_at as string
          ),
        updatedAt:
          new Date(
            row.updated_at as string
          )
      }
    }));
  }

  findUserByIdentity(
    platform: "telegram" | "discord",
    externalId: string
  ): PersistedUser | undefined {
    const row = this.database.prepare(
      `SELECT u.id, u.display_name, u.created_at, u.updated_at
       FROM users u
       INNER JOIN identities i ON i.user_id = u.id
       WHERE i.platform = ? AND i.external_id = ?
       LIMIT 1`
    ).get(platform, externalId) as {
      id: string;
      display_name: string;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      displayName: row.display_name,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  upsertCommunity(community: {
    id: string;
    name: string;
    mode?: "public" | "private";
    createdAt: Date;
    updatedAt: Date;
  }): void {
    this.database.prepare(
      `INSERT INTO communities
       (id, name, mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         mode = excluded.mode,
         updated_at = excluded.updated_at`
    ).run(
      community.id,
      community.name,
      community.mode ?? "public",
      community.createdAt.toISOString(),
      community.updatedAt.toISOString()
    );
  }

  upsertCommunityIdentity(identity: {
    id: string;
    communityId: string;
    platform: "telegram" | "discord";
    externalId: string;
    name?: string;
    createdAt: Date;
    updatedAt: Date;
  }): void {
    this.database.prepare(
      `INSERT INTO community_identities
       (id, community_id, platform, external_id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         community_id = excluded.community_id,
         platform = excluded.platform,
         external_id = excluded.external_id,
         name = excluded.name,
         updated_at = excluded.updated_at`
    ).run(
      identity.id,
      identity.communityId,
      identity.platform,
      identity.externalId,
      identity.name ?? null,
      identity.createdAt.toISOString(),
      identity.updatedAt.toISOString()
    );
  }

  upsertMembership(membership: {
    id: string;
    userId: string;
    communityId: string;
    status: "active" | "left" | "banned";
    joinedAt: Date;
    updatedAt: Date;
  }): void {
    this.database.prepare(
      `INSERT INTO memberships (id, user_id, community_id, status, joined_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         user_id = excluded.user_id,
         community_id = excluded.community_id,
         status = excluded.status,
         joined_at = excluded.joined_at,
         updated_at = excluded.updated_at`
    ).run(
      membership.id,
      membership.userId,
      membership.communityId,
      membership.status,
      membership.joinedAt.toISOString(),
      membership.updatedAt.toISOString()
    );
  }

  upsertCommunityRole(role: { id: string; communityId: string; name: string; permissions: Permission[] }): void {
    this.database.prepare(`INSERT INTO community_roles (id, community_id, name) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET community_id = excluded.community_id, name = excluded.name`
    ).run(role.id, role.communityId, role.name);
    const insert = this.database.prepare(`INSERT OR IGNORE INTO community_role_permissions (role_id, permission) VALUES (?, ?)`);
    for (const permission of role.permissions) insert.run(role.id, permission);
  }

  getCommunityRoles(communityId: string): Array<{ id: string; communityId: string; name: string; permissions: Permission[] }> {
    const rows = this.database.prepare(`SELECT id, community_id, name FROM community_roles WHERE community_id = ? ORDER BY id`).all(communityId) as Array<{id:string;community_id:string;name:string}>;
    return rows.map(row => ({
      id: row.id,
      communityId: row.community_id,
      name: row.name,
      permissions: (this.database.prepare(`SELECT permission FROM community_role_permissions WHERE role_id = ? ORDER BY permission`).all(row.id) as Array<{permission:string}>).map(x => x.permission as Permission)
    }));
  }

  assignCommunityRole(userId: string, roleId: string): void {
    this.database.prepare(`INSERT OR IGNORE INTO user_community_roles (user_id, role_id) VALUES (?, ?)`).run(userId, roleId);
  }

  revokeCommunityRole(userId: string, roleId: string): void {
    this.database.prepare(`DELETE FROM user_community_roles WHERE user_id = ? AND role_id = ?`).run(userId, roleId);
  }

  getUserCommunityRoles(userId: string, communityId: string): Array<{ id: string; communityId: string; name: string; permissions: Permission[] }> {
    const rows = this.database.prepare(`SELECT r.id, r.community_id, r.name FROM user_community_roles ur
      INNER JOIN community_roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND r.community_id = ? ORDER BY r.id`).all(userId, communityId) as Array<{id:string;community_id:string;name:string}>;
    return rows.map(row => ({
      id: row.id,
      communityId: row.community_id,
      name: row.name,
      permissions: (this.database.prepare(`SELECT permission FROM community_role_permissions WHERE role_id = ? ORDER BY permission`).all(row.id) as Array<{permission:string}>).map(x => x.permission as Permission)
    }));
  }

  assignSystemRole(
    userId: string,
    roleId: string
  ): void {
    this.database
      .prepare(
        `INSERT OR IGNORE INTO user_system_roles
         (user_id, role_id)
         VALUES (?, ?)`
      )
      .run(userId, roleId);
  }

  reassignUserReferences(
    sourceUserIds: string[],
    targetUserId: string
  ): void {
    const sourceIds = [
      ...new Set(
        sourceUserIds.filter(
          (userId) =>
            userId !== targetUserId
        )
      )
    ];

    if (sourceIds.length === 0) {
      return;
    }

    this.database.exec("BEGIN");

    try {
      for (const sourceUserId of sourceIds) {
        this.database.prepare(
          `UPDATE identities
           SET user_id = ?
           WHERE user_id = ?`
        ).run(
          targetUserId,
          sourceUserId
        );

        this.database.prepare(
          `INSERT OR IGNORE INTO memberships
           (id, user_id, community_id, status, joined_at, updated_at)
           SELECT id, ?, community_id, status, joined_at, updated_at
           FROM memberships
           WHERE user_id = ?`
        ).run(
          targetUserId,
          sourceUserId
        );

        this.database.prepare(
          "DELETE FROM memberships WHERE user_id = ?"
        ).run(sourceUserId);

        this.database.prepare(
          `INSERT OR IGNORE INTO user_system_roles
           (user_id, role_id)
           SELECT ?, role_id
           FROM user_system_roles
           WHERE user_id = ?`
        ).run(
          targetUserId,
          sourceUserId
        );

        this.database.prepare(
          "DELETE FROM user_system_roles WHERE user_id = ?"
        ).run(sourceUserId);

        this.database.prepare(
          `INSERT OR IGNORE INTO user_community_roles
           (user_id, role_id)
           SELECT ?, role_id
           FROM user_community_roles
           WHERE user_id = ?`
        ).run(
          targetUserId,
          sourceUserId
        );

        this.database.prepare(
          "DELETE FROM user_community_roles WHERE user_id = ?"
        ).run(sourceUserId);

        this.database.prepare(
          "DELETE FROM users WHERE id = ?"
        ).run(sourceUserId);
      }

      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getDatabasePath(): string {
    const row =
      this.database.prepare(
        "PRAGMA database_list"
      ).get() as {
        file: string;
      };

    return row.file;
  }

  getUserSystemRoleIds(userId: string): string[] {
    const rows = this.database.prepare(
      `SELECT role_id FROM user_system_roles WHERE user_id = ? ORDER BY role_id`
    ).all(userId) as Array<{ role_id: string }>;

    return rows.map((row) => row.role_id);
  }

  hasSystemRole(
    userId: string,
    roleId: string
  ): boolean {
    const row =
      this.database
        .prepare(
          `SELECT 1
           FROM user_system_roles
           WHERE user_id = ? AND role_id = ?`
        )
        .get(
          userId,
          roleId
        );

    return row !== undefined;
  }

  getSystemSetting(
    key: string
  ): string | undefined {
    const row =
      this.database.prepare(
        "SELECT value FROM system_settings WHERE key = ?"
      ).get(key) as {
        value: string;
      } | undefined;

    return row?.value;
  }

  getRuntimeState<T>(key: string): T | undefined {
    const row = this.database.prepare(
      "SELECT value FROM runtime_state WHERE key = ?"
    ).get(key) as { value?: string } | undefined;

    if (!row?.value) return undefined;

    try {
      return JSON.parse(row.value) as T;
    } catch {
      return undefined;
    }
  }

  setRuntimeState(key: string, value: unknown, now = new Date()): void {
    this.database.prepare(
      `INSERT INTO runtime_state (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`
    ).run(key, JSON.stringify(value), now.toISOString());
  }

  deleteRuntimeState(key: string): void {
    this.database.prepare(
      "DELETE FROM runtime_state WHERE key = ?"
    ).run(key);
  }

  setSystemSetting(
    key: string,
    value: string,
    now = new Date()
  ): void {
    this.database.prepare(
      `INSERT INTO system_settings
       (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`
    ).run(
      key,
      value,
      now.toISOString()
    );
  }

  close(): void {
    this.database.close();
  }

  private migrateLegacyUserIds(): void {
    const rows =
      this.database.prepare(
        `SELECT id, display_name, created_at, updated_at
         FROM users
         WHERE id LIKE 'user-%'
         ORDER BY id`
      ).all() as Array<{
        id: string;
        display_name: string;
        created_at: string;
        updated_at: string;
      }>;

    for (const row of rows) {
      const newUserId =
        `mx_${randomUUID()}`;

      this.database.prepare(
        `INSERT INTO users
         (id, display_name, created_at, updated_at)
         VALUES (?, ?, ?, ?)`
      ).run(
        newUserId,
        row.display_name,
        row.created_at,
        row.updated_at
      );

      this.reassignUserReferences(
        [row.id],
        newUserId
      );
    }
  }

  setCommandEnabled(communityId: string, commandName: string, enabled: boolean, now = new Date()): void {
    this.database.prepare(`
      INSERT INTO community_command_settings
        (community_id, command_name, enabled, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(community_id, command_name) DO UPDATE SET
        enabled = excluded.enabled,
        updated_at = excluded.updated_at
    `).run(communityId, commandName.toLowerCase(), enabled ? 1 : 0, now.toISOString());
  }

  isCommandEnabled(communityId: string, commandName: string): boolean {
    const row = this.database.prepare(
      "SELECT enabled FROM community_command_settings WHERE community_id = ? AND command_name = ?"
    ).get(communityId, commandName.toLowerCase()) as { enabled?: number } | undefined;
    return row?.enabled !== 0;
  }

  getCommandSettings(communityId: string): Array<{ commandName: string; enabled: boolean }> {
    const rows = this.database.prepare(
      "SELECT command_name, enabled FROM community_command_settings WHERE community_id = ? ORDER BY command_name"
    ).all(communityId) as Array<{ command_name: string; enabled: number }>;
    return rows.map((row) => ({ commandName: row.command_name, enabled: row.enabled !== 0 }));
  }

  upsertModerationCase(item: ModerationCase): void {
    this.database.prepare(`INSERT INTO moderation_cases
      (id, action, actor_user_id, target_user_id, community_id, platform,
       community_external_id, user_external_id, duration_seconds, reason,
       status, created_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        revoked_at = excluded.revoked_at,
        reason = excluded.reason,
        duration_seconds = excluded.duration_seconds`
    ).run(
      item.id, item.action, item.actorUserId, item.targetUserId,
      item.communityId, item.platform, item.communityExternalId,
      item.userExternalId, item.durationSeconds ?? null,
      item.reason ?? null, item.status, item.createdAt.toISOString(),
      item.revokedAt?.toISOString() ?? null
    );
  }

  getModerationCases(communityId: string): ModerationCase[] {
    const rows = this.database.prepare(`
      SELECT id, action, actor_user_id, target_user_id, community_id, platform,
             community_external_id, user_external_id, duration_seconds, reason,
             status, created_at, revoked_at
      FROM moderation_cases
      WHERE community_id = ?
      ORDER BY created_at DESC
    `).all(communityId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: row.id as string,
      action: row.action as ModerationActionType,
      actorUserId: row.actor_user_id as string,
      targetUserId: row.target_user_id as string,
      communityId: row.community_id as string,
      platform: row.platform as "telegram" | "discord",
      communityExternalId: row.community_external_id as string,
      userExternalId: row.user_external_id as string,
      ...(row.duration_seconds !== null && row.duration_seconds !== undefined
        ? { durationSeconds: Number(row.duration_seconds) }
        : {}),
      ...(row.reason ? { reason: row.reason as string } : {}),
      status: row.status as ModerationCaseStatus,
      createdAt: new Date(row.created_at as string),
      ...(row.revoked_at ? { revokedAt: new Date(row.revoked_at as string) } : {})
    }));
  }

  getAllModerationCases(): ModerationCase[] {
    const rows = this.database.prepare(`
      SELECT id, action, actor_user_id, target_user_id, community_id, platform,
             community_external_id, user_external_id, duration_seconds, reason,
             status, created_at, revoked_at
      FROM moderation_cases
      ORDER BY created_at DESC
    `).all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: row.id as string,
      action: row.action as ModerationActionType,
      actorUserId: row.actor_user_id as string,
      targetUserId: row.target_user_id as string,
      communityId: row.community_id as string,
      platform: row.platform as "telegram" | "discord",
      communityExternalId: row.community_external_id as string,
      userExternalId: row.user_external_id as string,
      ...(row.duration_seconds != null ? { durationSeconds: Number(row.duration_seconds) } : {}),
      ...(row.reason ? { reason: row.reason as string } : {}),
      status: row.status as ModerationCaseStatus,
      createdAt: new Date(row.created_at as string),
      ...(row.revoked_at ? { revokedAt: new Date(row.revoked_at as string) } : {})
    }));
  }

  getModerationCase(caseId: string): ModerationCase | undefined {
    const row = this.database.prepare(`
      SELECT id, action, actor_user_id, target_user_id, community_id, platform,
             community_external_id, user_external_id, duration_seconds, reason,
             status, created_at, revoked_at
      FROM moderation_cases WHERE id = ?
    `).get(caseId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      id: row.id as string,
      action: row.action as ModerationActionType,
      actorUserId: row.actor_user_id as string,
      targetUserId: row.target_user_id as string,
      communityId: row.community_id as string,
      platform: row.platform as "telegram" | "discord",
      communityExternalId: row.community_external_id as string,
      userExternalId: row.user_external_id as string,
      ...(row.duration_seconds !== null && row.duration_seconds !== undefined ? { durationSeconds: Number(row.duration_seconds) } : {}),
      ...(row.reason ? { reason: row.reason as string } : {}),
      status: row.status as ModerationCaseStatus,
      createdAt: new Date(row.created_at as string),
      ...(row.revoked_at ? { revokedAt: new Date(row.revoked_at as string) } : {})
    };
  }

  private ensureMigrations(): void {
    try {
      this.database.exec(
        "ALTER TABLE identities ADD COLUMN avatar_url TEXT"
      );
    } catch {
      // Column already exists.
    }
  }

  private seedSystemRole(
    role: SystemRole
  ): void {
    this.database
      .prepare(
        `INSERT INTO system_roles
         (id, name)
         VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name`
      )
      .run(
        role.id,
        role.name
      );

    const insertPermission =
      this.database.prepare(
        `INSERT OR IGNORE INTO system_role_permissions
         (role_id, permission)
         VALUES (?, ?)`
      );

    for (const permission of role.permissions) {
      insertPermission.run(
        role.id,
        permission
      );
    }
  }
}
