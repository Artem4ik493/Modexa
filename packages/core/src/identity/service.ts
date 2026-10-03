import type {
  ExternalIdentity,
  ExternalIdentityId,
  IdentityPlatform,
  User,
  UserId
} from "./types.js";

import type { ModexaDatabase } from "../database/service.js";

export interface CreateUserInput {
  displayName: string;
  now?: Date;
}

export interface AttachIdentityInput {
  userId: UserId;
  platform: IdentityPlatform;
  externalId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  now?: Date;
}

export class IdentityService {
  private nextUserId = 1;
  private nextIdentityId = 1;

  constructor(
    private readonly database?: ModexaDatabase
  ) {
    if (database) {
      this.nextUserId =
        database.getNextUserId();
      this.nextIdentityId =
        database.getNextIdentityId();
    }
  }

  private readonly users = new Map<UserId, User>();
  private readonly identities = new Map<
    ExternalIdentityId,
    ExternalIdentity
  >();

  private readonly identityIndex = new Map<
    string,
    ExternalIdentityId
  >();

  createUser(input: CreateUserInput): User {
    const now = input.now ?? new Date();

    const user: User = {
      id: `user-${this.nextUserId++}`,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      createdAt: now,
      updatedAt: now
    };

    this.users.set(user.id, user);
    this.database?.createUser(user);

    return user;
  }

  getUser(userId: UserId): User | undefined {
    return this.users.get(userId);
  }

  attachIdentity(
    input: AttachIdentityInput
  ): ExternalIdentity {
    const user = this.users.get(input.userId);

    if (!user) {
      throw new Error(
        `User "${input.userId}" does not exist`
      );
    }

    const identityKey = this.getIdentityKey(
      input.platform,
      input.externalId
    );

    const existingIdentityId =
      this.identityIndex.get(identityKey);

    if (existingIdentityId) {
      const existingIdentity =
        this.identities.get(existingIdentityId);

      if (existingIdentity) {
        if (existingIdentity.userId === input.userId) {
          existingIdentity.username =
            input.username;
          existingIdentity.displayName =
            input.displayName;
          existingIdentity.avatarUrl =
            input.avatarUrl;
          existingIdentity.updatedAt =
            input.now ?? new Date();

          this.database?.updateIdentityProfile(
            existingIdentity.id,
            existingIdentity.username,
            existingIdentity.displayName,
            existingIdentity.avatarUrl,
            existingIdentity.updatedAt
          );

          return existingIdentity;
        }

        throw new Error(
          `Identity "${input.platform}:${input.externalId}" is already attached to another user`
        );
      }
    }

    const now = input.now ?? new Date();

    const identity: ExternalIdentity = {
      id: `identity-${this.nextIdentityId++}`,
      userId: input.userId,
      platform: input.platform,
      externalId: input.externalId,
      username: input.username,
      displayName: input.displayName,
      createdAt: now,
      updatedAt: now
    };

    this.identities.set(identity.id, identity);
    this.identityIndex.set(identityKey, identity.id);
    this.database?.createIdentity(identity);

    user.updatedAt = now;

    return identity;
  }

  findUserByIdentity(
    platform: IdentityPlatform,
    externalId: string
  ): User | undefined {
    const identityKey = this.getIdentityKey(
      platform,
      externalId
    );

    const identityId =
      this.identityIndex.get(identityKey);

    if (!identityId && this.database) {
      const persistedIdentity =
        this.database.getIdentityByExternalId(
          platform,
          externalId
        );

      if (!persistedIdentity) {
        return undefined;
      }

      const persistedUser =
        this.database.getUser(
          persistedIdentity.userId
        );

      if (!persistedUser) {
        return undefined;
      }

      this.users.set(
        persistedUser.id,
        persistedUser
      );

      this.identities.set(
        persistedIdentity.id,
        persistedIdentity
      );

      this.identityIndex.set(
        identityKey,
        persistedIdentity.id
      );

      return persistedUser;
    }

    if (!identityId) {
      return undefined;
    }

    const identity = this.identities.get(identityId);

    if (!identity) {
      return undefined;
    }

    return this.users.get(identity.userId);
  }

  findUserByUsername(
    username: string,
    platform?: IdentityPlatform
  ): User | undefined {
    const normalized =
      username.replace(/^@/, "").toLowerCase();

    const identity =
      [...this.identities.values()].find(
        (item) =>
          item.username?.toLowerCase() ===
            normalized &&
          (platform === undefined ||
            item.platform === platform)
      );

    if (identity) {
      return this.users.get(
        identity.userId
      );
    }

    if (this.database) {
      const rows =
        this.database.findUsersByUsername(
          normalized,
          platform
        );

      const persisted =
        rows[0];

      if (!persisted) {
        return undefined;
      }

      this.users.set(
        persisted.user.id,
        persisted.user
      );

      this.identities.set(
        persisted.identity.id,
        persisted.identity
      );

      this.identityIndex.set(
        this.getIdentityKey(
          persisted.identity.platform,
          persisted.identity.externalId
        ),
        persisted.identity.id
      );

      return persisted.user;
    }

    return undefined;
  }

  getUserIdentities(
    userId: UserId
  ): ExternalIdentity[] {
    return [...this.identities.values()].filter(
      (identity) => identity.userId === userId
    );
  }

  mergeUsers(
    sourceUserId: UserId,
    targetUserId: UserId,
    now = new Date()
  ): User {
    if (sourceUserId === targetUserId) {
      const sourceUser =
        this.users.get(sourceUserId);

      if (!sourceUser) {
        throw new Error(
          `User "${sourceUserId}" does not exist`
        );
      }

      return sourceUser;
    }

    const sourceUser =
      this.users.get(sourceUserId);
    const targetUser =
      this.users.get(targetUserId);

    if (!sourceUser) {
      throw new Error(
        `User "${sourceUserId}" does not exist`
      );
    }

    if (!targetUser) {
      throw new Error(
        `User "${targetUserId}" does not exist`
      );
    }

    const sourceIdentities =
      this.getUserIdentities(sourceUserId);

    const sourceKeys = new Set(
      sourceIdentities.map((identity) =>
        this.getIdentityKey(
          identity.platform,
          identity.externalId
        )
      )
    );

    const targetIdentities =
      this.getUserIdentities(targetUserId);

    for (const identity of targetIdentities) {
      const key = this.getIdentityKey(
        identity.platform,
        identity.externalId
      );

      if (sourceKeys.has(key)) {
        throw new Error(
          `Cannot merge users because identity "${key}" exists on both users`
        );
      }
    }

    for (const identity of targetIdentities) {
      identity.userId = sourceUserId;
      identity.updatedAt = now;
    }

    sourceUser.updatedAt = now;
    this.users.delete(targetUserId);

    return sourceUser;
  }

  detachIdentity(
    identityId: ExternalIdentityId,
    now = new Date()
  ): void {
    const identity = this.identities.get(identityId);

    if (!identity) {
      throw new Error(
        `Identity "${identityId}" does not exist`
      );
    }

    const userIdentities =
      this.getUserIdentities(identity.userId);

    if (userIdentities.length <= 1) {
      throw new Error(
        "Cannot detach the last identity from a user"
      );
    }

    const identityKey = this.getIdentityKey(
      identity.platform,
      identity.externalId
    );

    this.identities.delete(identity.id);
    this.identityIndex.delete(identityKey);

    const user = this.users.get(identity.userId);

    if (user) {
      user.updatedAt = now;
    }
  }

  private getIdentityKey(
    platform: IdentityPlatform,
    externalId: string
  ): string {
    return `${platform}:${externalId}`;
  }
}