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

  private readonly database: DatabaseSync;

  constructor(options: DatabaseOptions) {
    mkdirSync(dirname(options.path), {
      recursive: true
    });

    this.database =
      new DatabaseSync(options.path);

    this.database.exec(
      MODEXA_DATABASE_SCHEMA
    );

    this.ensureMigrations();
    this.migrateLegacyUserIds();

    this.seedSystemRole(
      MODEXA_OWNER_ROLE
    );
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
