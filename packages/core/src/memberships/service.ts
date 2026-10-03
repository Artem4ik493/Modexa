import type { CommunityId } from "../communities/types.js";
import type { UserId } from "../identity/types.js";
import type {
  Membership,
  MembershipStatus
} from "./types.js";

export interface CreateMembershipInput {
  userId: UserId;
  communityId: CommunityId;
  now?: Date;
}

export class MembershipService {
  private readonly memberships = new Map<
    string,
    Membership
  >();

  private readonly membershipIndex = new Map<
    string,
    string
  >();

  private nextMembershipId = 1;

  createMembership(
    input: CreateMembershipInput
  ): Membership {
    const key = this.getMembershipKey(
      input.userId,
      input.communityId
    );

    const existingId =
      this.membershipIndex.get(key);

    if (existingId) {
      const existing =
        this.memberships.get(existingId);

      if (existing) {
        throw new Error(
          `Membership already exists for user "${input.userId}" in community "${input.communityId}"`
        );
      }
    }

    const now = input.now ?? new Date();

    const membership: Membership = {
      id: `membership-${this.nextMembershipId++}`,
      userId: input.userId,
      communityId: input.communityId,
      status: "active",
      joinedAt: now,
      updatedAt: now
    };

    this.memberships.set(
      membership.id,
      membership
    );

    this.membershipIndex.set(
      key,
      membership.id
    );

    return membership;
  }

  getMembership(
    membershipId: string
  ): Membership | undefined {
    return this.memberships.get(membershipId);
  }

  findMembership(
    userId: UserId,
    communityId: CommunityId
  ): Membership | undefined {
    const key = this.getMembershipKey(
      userId,
      communityId
    );

    const membershipId =
      this.membershipIndex.get(key);

    if (!membershipId) {
      return undefined;
    }

    return this.memberships.get(membershipId);
  }

  getUserMemberships(
    userId: UserId
  ): Membership[] {
    return [...this.memberships.values()].filter(
      (membership) =>
        membership.userId === userId
    );
  }

  getCommunityMemberships(
    communityId: CommunityId
  ): Membership[] {
    return [...this.memberships.values()].filter(
      (membership) =>
        membership.communityId === communityId
    );
  }

  isActiveMember(
    userId: UserId,
    communityId: CommunityId
  ): boolean {
    return (
      this.findMembership(
        userId,
        communityId
      )?.status === "active"
    );
  }

  moveUsers(
    sourceUserIds: UserId[],
    targetUserId: UserId,
    now = new Date()
  ): void {
    const sourceIds =
      new Set(sourceUserIds);

    for (const sourceUserId of sourceIds) {
      const sourceMemberships =
        this.getUserMemberships(
          sourceUserId
        );

      for (const sourceMembership of sourceMemberships) {
        const targetMembership =
          this.findMembership(
            targetUserId,
            sourceMembership.communityId
          );

        if (targetMembership) {
          if (
            sourceMembership.status === "banned" ||
            targetMembership.status === "left"
          ) {
            targetMembership.status =
              sourceMembership.status;
          }

          if (
            sourceMembership.joinedAt <
            targetMembership.joinedAt
          ) {
            targetMembership.joinedAt =
              sourceMembership.joinedAt;
          }

          targetMembership.updatedAt =
            now;

          this.memberships.delete(
            sourceMembership.id
          );

          this.membershipIndex.delete(
            this.getMembershipKey(
              sourceUserId,
              sourceMembership.communityId
            )
          );

          continue;
        }

        this.membershipIndex.delete(
          this.getMembershipKey(
            sourceUserId,
            sourceMembership.communityId
          )
        );

        sourceMembership.userId =
          targetUserId;
        sourceMembership.updatedAt =
          now;

        this.membershipIndex.set(
          this.getMembershipKey(
            targetUserId,
            sourceMembership.communityId
          ),
          sourceMembership.id
        );
      }
    }
  }

  updateStatus(
    membershipId: string,
    status: MembershipStatus,
    now = new Date()
  ): Membership {
    const membership =
      this.memberships.get(membershipId);

    if (!membership) {
      throw new Error(
        `Membership "${membershipId}" does not exist`
      );
    }

    membership.status = status;
    membership.updatedAt = now;

    return membership;
  }

  leave(
    membershipId: string,
    now = new Date()
  ): Membership {
    return this.updateStatus(
      membershipId,
      "left",
      now
    );
  }

  ban(
    membershipId: string,
    now = new Date()
  ): Membership {
    return this.updateStatus(
      membershipId,
      "banned",
      now
    );
  }

  reactivate(
    membershipId: string,
    now = new Date()
  ): Membership {
    return this.updateStatus(
      membershipId,
      "active",
      now
    );
  }

  private getMembershipKey(
    userId: UserId,
    communityId: CommunityId
  ): string {
    return `${userId}:${communityId}`;
  }
}