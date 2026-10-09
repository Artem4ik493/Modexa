import type { UserId } from "../identity/types.js";
import type { CommunityId } from "../communities/types.js";

export type SystemRoleId = string;
export type CommunityRoleId = string;

export type Permission =
  | "system.users.manage"
  | "system.communities.manage"
  | "system.subscriptions.manage"
  | "system.backup.create"
  | "system.backup.restore"
  | "system.identity.unlink"
  | "community.view"
  | "community.manage"
  | "member.view"
  | "member.manage"
  | "moderation.view"
  | "moderation.warn"
  | "moderation.mute"
  | "moderation.kick"
  | "moderation.ban"
  | "moderation.clear"
  | "commands.use"
  | "commands.manage"
  | "bridge.view"
  | "bridge.manage";

export interface SystemRole {
  id: SystemRoleId;
  name: string;
  permissions: Permission[];
}

export interface CommunityRole {
  id: CommunityRoleId;
  communityId: CommunityId;
  name: string;
  permissions: Permission[];
}

export interface UserSystemRole {
  userId: UserId;
  roleId: SystemRoleId;
}

export interface UserCommunityRole {
  userId: UserId;
  communityRoleId: CommunityRoleId;
}