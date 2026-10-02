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
       (id, user_id, platform, external_id, username, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      identity.id,
      identity.userId,
      identity.platform,
      identity.externalId,
      identity.username ?? null,
      identity.displayName ?? null,
      identity.createdAt.toISOString(),
      identity.updatedAt.toISOString()
    );
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

  close(): void {
    this.database.close();
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
