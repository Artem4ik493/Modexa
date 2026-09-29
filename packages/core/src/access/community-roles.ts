import type { CommunityId } from "../communities/types.js";
import type { CommunityRole } from "./types.js";

export const COMMUNITY_ROLE_NAMES = {
  ADMIN: "ADMIN",
  MODERATOR: "MODERATOR",
  MEMBER: "MEMBER"
} as const;

export function createBuiltinCommunityRoles(
  communityId: CommunityId
): CommunityRole[] {
  return [
    {
      id: `${communityId}:admin`,
      communityId,
      name: COMMUNITY_ROLE_NAMES.ADMIN,
      permissions: [
        "community.view",
        "community.manage",
        "member.view",
        "member.manage",
        "moderation.warn",
        "moderation.mute",
        "moderation.kick",
        "moderation.ban",
        "commands.use",
        "commands.manage",
        "bridge.view",
        "bridge.manage"
      ]
    },
    {
      id: `${communityId}:moderator`,
      communityId,
      name: COMMUNITY_ROLE_NAMES.MODERATOR,
      permissions: [
        "community.view",
        "member.view",
        "moderation.warn",
        "moderation.mute",
        "moderation.kick",
        "moderation.ban",
        "commands.use",
        "bridge.view"
      ]
    },
    {
      id: `${communityId}:member`,
      communityId,
      name: COMMUNITY_ROLE_NAMES.MEMBER,
      permissions: [
        "community.view",
        "commands.use"
      ]
    }
  ];
}