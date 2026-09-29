import type { CommunityId } from "../communities/types.js";
import type { UserId } from "../identity/types.js";

export type MembershipId = string;

export type MembershipStatus =
  | "active"
  | "left"
  | "banned";

export interface Membership {
  id: MembershipId;
  userId: UserId;
  communityId: CommunityId;
  status: MembershipStatus;
  joinedAt: Date;
  updatedAt: Date;
}