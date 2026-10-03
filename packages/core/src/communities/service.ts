import type {
  Community,
  CommunityId,
  CommunityIdentity,
  CommunityIdentityId,
  CommunityPlatform
} from "./types.js";

import type { ModexaDatabase } from "../database/service.js";
import type { BillingService } from "../billing/service.js";

export interface CreateCommunityInput {
  name: string;
  now?: Date;
}

export interface AttachCommunityIdentityInput {
  communityId: CommunityId;
  platform: CommunityPlatform;
  externalId: string;
  name?: string;
  now?: Date;
}

export class CommunityService {
  constructor(
    private readonly database?: ModexaDatabase,
    private readonly billingService?: BillingService
  ) {
    for (const item of database?.getCommunitiesSnapshot() ?? []) {
      const community: Community = {
        id: item.id,
        name: item.name,
        mode: item.mode === "private" ? "private" : "public",
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      };
      this.communities.set(community.id, community);
    }

    for (const identity of database?.getCommunityIdentitiesSnapshot() ?? []) {
      const item: CommunityIdentity = {
        id: identity.id,
        communityId: identity.communityId,
        platform: identity.platform,
        externalId: identity.externalId,
        name: identity.name,
        createdAt: identity.createdAt,
        updatedAt: identity.updatedAt
      };
      this.identities.set(item.id, item);
      this.identityIndex.set(this.getIdentityKey(item.platform, item.externalId), item.id);
    }

    this.nextCommunityId = this.getNextNumericId(
      [...this.communities.keys()],
      "community-"
    );
    this.nextIdentityId = this.getNextNumericId(
      [...this.identities.keys()],
      "community-identity-"
    );
  }

  private readonly communities = new Map<
    CommunityId,
    Community
  >();

  private readonly identities = new Map<
    CommunityIdentityId,
    CommunityIdentity
  >();

  private readonly identityIndex = new Map<
    string,
    CommunityIdentityId
  >();

  private nextCommunityId = 1;
  private nextIdentityId = 1;

  createCommunity(
    input: CreateCommunityInput
  ): Community {
    const now = input.now ?? new Date();

    const community: Community = {
      id: `community-${this.nextCommunityId++}`,
      name: input.name,
      mode: "public",
      createdAt: now,
      updatedAt: now
    };

    this.communities.set(
      community.id,
      community
    );

    this.database?.upsertCommunity(community);
    if (this.billingService?.getPlan("free")) {
      this.billingService.createSubscription({
        communityId: community.id,
        planId: "free",
        now
      });
    }

    return community;
  }

  getCommunity(
    communityId: CommunityId
  ): Community | undefined {
    return this.communities.get(communityId);
  }

  setMode(
    communityId: CommunityId,
    mode: NonNullable<Community["mode"]>,
    now = new Date()
  ): Community {
    const community = this.communities.get(
      communityId
    );

    if (!community) {
      throw new Error(
        `Community "${communityId}" does not exist`
      );
    }

    community.mode = mode;
    community.updatedAt = now;
    this.database?.upsertCommunity(community);

    return community;
  }

  getCommunities(): Community[] {
    return [...this.communities.values()];
  }

  attachIdentity(
    input: AttachCommunityIdentityInput
  ): CommunityIdentity {
    const community =
      this.communities.get(input.communityId);

    if (!community) {
      throw new Error(
        `Community "${input.communityId}" does not exist`
      );
    }

    const identityKey = this.getIdentityKey(
      input.platform,
      input.externalId
    );

    const existingId =
      this.identityIndex.get(identityKey);

    if (existingId) {
      const existing =
        this.identities.get(existingId);

      if (existing) {
        if (
          existing.communityId ===
          input.communityId
        ) {
          return existing;
        }

        throw new Error(
          `Community identity "${input.platform}:${input.externalId}" is already attached to another community`
        );
      }
    }

    const now = input.now ?? new Date();

    const identity: CommunityIdentity = {
      id: `community-identity-${this.nextIdentityId++}`,
      communityId: input.communityId,
      platform: input.platform,
      externalId: input.externalId,
      name: input.name,
      createdAt: now,
      updatedAt: now
    };

    this.identities.set(identity.id, identity);
    this.identityIndex.set(
      identityKey,
      identity.id
    );

    community.updatedAt = now;

    this.database?.upsertCommunityIdentity(identity);

    return identity;
  }

  findByIdentity(
    platform: CommunityPlatform,
    externalId: string
  ): Community | undefined {
    const identityId = this.identityIndex.get(
      this.getIdentityKey(platform, externalId)
    );

    if (!identityId) {
      return undefined;
    }

    const identity =
      this.identities.get(identityId);

    if (!identity) {
      return undefined;
    }

    return this.communities.get(
      identity.communityId
    );
  }

  getCommunityIdentities(
    communityId: CommunityId
  ): CommunityIdentity[] {
    return [...this.identities.values()].filter(
      (identity) =>
        identity.communityId === communityId
    );
  }

  private getNextNumericId(ids: string[], prefix: string): number {
    let next = 1;
    for (const id of ids) {
      const value = Number(id.slice(prefix.length));
      if (Number.isFinite(value)) next = Math.max(next, value + 1);
    }
    return next;
  }

  private getIdentityKey(
    platform: CommunityPlatform,
    externalId: string
  ): string {
    return `${platform}:${externalId}`;
  }
}