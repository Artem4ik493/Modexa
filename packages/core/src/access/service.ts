import type { CommunityId } from "../communities/types.js";
import type { UserId } from "../identity/types.js";
import type {
  CommunityRole,
  Permission,
  SystemRole,
  UserCommunityRole,
  UserSystemRole
} from "./types.js";

export interface SystemRoleAssignmentStore {
  hasSystemRole(
    userId: UserId,
    roleId: string
  ): boolean;

  assignSystemRole?(
    userId: UserId,
    roleId: string
  ): void;

  getUserSystemRoleIds?(
    userId: UserId
  ): string[];

  revokeSystemRole?(
    userId: UserId,
    roleId: string
  ): void;
}

export interface CommunityRoleStore {
  upsertCommunityRole(
    role: CommunityRole
  ): void;

  getCommunityRoles(
    communityId: CommunityId
  ): CommunityRole[];

  assignCommunityRole(
    userId: UserId,
    roleId: string
  ): void;

  revokeCommunityRole(
    userId: UserId,
    roleId: string
  ): void;

  getUserCommunityRoles(
    userId: UserId,
    communityId: CommunityId
  ): CommunityRole[];
}

export class AccessControlService {
  constructor(
    private readonly systemRoleStore?: SystemRoleAssignmentStore,
    private readonly communityRoleStore?: CommunityRoleStore
  ) {}

  private readonly systemRoles = new Map<
    string,
    SystemRole
  >();

  private readonly communityRoles = new Map<
    string,
    CommunityRole
  >();

  private readonly userSystemRoles: UserSystemRole[] =
    [];

  private readonly userCommunityRoles: UserCommunityRole[] =
    [];

  registerSystemRole(role: SystemRole): void {
    this.systemRoles.set(role.id, role);
  }

  registerCommunityRole(
    role: CommunityRole
  ): void {
    this.communityRoles.set(role.id, role);
    this.communityRoleStore?.upsertCommunityRole(role);
  }

  getSystemRole(
    roleId: string
  ): SystemRole | undefined {
    return this.systemRoles.get(roleId);
  }

  getCommunityRole(
    roleId: string
  ): CommunityRole | undefined {
    return this.communityRoles.get(roleId);
  }

  getCommunityRoleRank(role: CommunityRole): number {
    if (Number.isFinite(role.rank)) {
      return role.rank!;
    }

    const standardRanks: Record<string, number> = {
      OWNER: 400,
      ADMIN: 300,
      MODERATOR: 200,
      MEMBER: 100
    };

    return standardRanks[role.name.trim().toUpperCase()] ?? 0;
  }

  getUserCommunityRank(userId: UserId, communityId: CommunityId): number {
    return this.getUserCommunityRoles(userId, communityId)
      .reduce((rank, role) => Math.max(rank, this.getCommunityRoleRank(role)), 0);
  }

  canModerateUser(
    actorUserId: UserId,
    targetUserId: UserId,
    communityId: CommunityId
  ): boolean {
    if (actorUserId === targetUserId) {
      return false;
    }

    const actorRoles = this.getUserCommunityRoles(actorUserId, communityId);
    const targetRoles = this.getUserCommunityRoles(targetUserId, communityId);

    // Users without a Modexa role cannot moderate role-bearing users.
    if (actorRoles.length === 0) {
      return false;
    }

    const actorRank = Math.max(...actorRoles.map((role) => this.getCommunityRoleRank(role)));
    const targetRank = targetRoles.length > 0
      ? Math.max(...targetRoles.map((role) => this.getCommunityRoleRank(role)))
      : 0;

    // Strict hierarchy: equal-rank users cannot moderate each other.
    return actorRank > targetRank;
  }

  assignSystemRole(
    userId: UserId,
    roleId: string
  ): void {
    const role = this.systemRoles.get(roleId);

    if (!role) {
      throw new Error(
        `System role "${roleId}" does not exist`
      );
    }

    const alreadyAssigned =
      this.userSystemRoles.some(
        (assignment) =>
          assignment.userId === userId &&
          assignment.roleId === roleId
      );

    if (alreadyAssigned) {
      return;
    }

    this.userSystemRoles.push({
      userId,
      roleId
    });

    this.systemRoleStore?.assignSystemRole?.(
      userId,
      roleId
    );
  }

  revokeSystemRole(
    userId: UserId,
    roleId: string
  ): void {
    for (let index = this.userSystemRoles.length - 1; index >= 0; index--) {
      const assignment = this.userSystemRoles[index]!;
      if (assignment.userId === userId && assignment.roleId === roleId) {
        this.userSystemRoles.splice(index, 1);
      }
    }

    // Keep persistent assignments in sync when a role is revoked.
    this.systemRoleStore?.revokeSystemRole?.(userId, roleId);
  }

  assignCommunityRole(
    userId: UserId,
    communityRoleId: string
  ): void {
    const role =
      this.communityRoles.get(communityRoleId);

    if (!role) {
      throw new Error(
        `Community role "${communityRoleId}" does not exist`
      );
    }

    const alreadyAssigned =
      this.userCommunityRoles.some(
        (assignment) =>
          assignment.userId === userId &&
          assignment.communityRoleId ===
            communityRoleId
      );

    if (alreadyAssigned) {
      return;
    }

    this.userCommunityRoles.push({
      userId,
      communityRoleId
    });

    this.communityRoleStore?.assignCommunityRole(
      userId,
      communityRoleId
    );
  }

  revokeCommunityRole(
    userId: UserId,
    communityRoleId: string
  ): void {
    const index =
      this.userCommunityRoles.findIndex(
        (assignment) =>
          assignment.userId === userId &&
          assignment.communityRoleId ===
            communityRoleId
      );

    if (index === -1) {
      this.communityRoleStore?.revokeCommunityRole(
        userId,
        communityRoleId
      );
      return;
    }

    this.userCommunityRoles.splice(index, 1);
    this.communityRoleStore?.revokeCommunityRole(
      userId,
      communityRoleId
    );
  }

  getUserSystemRoles(
    userId: UserId
  ): SystemRole[] {
    const persistedIds =
      this.systemRoleStore?.getUserSystemRoleIds?.(userId) ?? [];

    const persistedAssignments =
      persistedIds.map((roleId) => ({
        userId,
        roleId
      }));

    const allAssignments = [
      ...this.userSystemRoles,
      ...persistedAssignments
    ];

    return allAssignments
      .filter(
        (assignment) =>
          assignment.userId === userId
      )
      .map(
        (assignment) =>
          this.systemRoles.get(assignment.roleId)
      )
      .filter(
        (role): role is SystemRole =>
          role !== undefined
      );
  }

  getUserCommunityRoles(
    userId: UserId,
    communityId?: CommunityId
  ): CommunityRole[] {
    const persisted =
      this.communityRoleStore?.getUserCommunityRoles(
        userId,
        communityId ?? ""
      ) ?? [];

    return [
      ...this.userCommunityRoles
        .filter(
        (assignment) =>
          assignment.userId === userId
      )
      .map(
        (assignment) =>
          this.communityRoles.get(
            assignment.communityRoleId
          )
      )
      .filter(
        (role): role is CommunityRole =>
          role !== undefined
      )
      .filter(
        (role) =>
          communityId === undefined ||
          role.communityId === communityId
      ),
      ...persisted
    ].filter(
      (role, index, roles) =>
        roles.findIndex(
          (item) => item.id === role.id
        ) === index
    );
  }

  moveUsers(
    sourceUserIds: UserId[],
    targetUserId: UserId
  ): void {
    const sourceIds =
      new Set(sourceUserIds);

    for (const assignment of this.userSystemRoles) {
      if (sourceIds.has(assignment.userId)) {
        assignment.userId =
          targetUserId;
      }
    }

    const systemKeys =
      new Set<string>();

    for (let index = this.userSystemRoles.length - 1; index >= 0; index--) {
      const assignment =
        this.userSystemRoles[index]!;

      const key =
        `${assignment.userId}:${assignment.roleId}`;

      if (systemKeys.has(key)) {
        this.userSystemRoles.splice(index, 1);
      } else {
        systemKeys.add(key);
      }
    }

    for (const assignment of this.userCommunityRoles) {
      if (sourceIds.has(assignment.userId)) {
        assignment.userId =
          targetUserId;
      }
    }

    const communityKeys =
      new Set<string>();

    for (let index = this.userCommunityRoles.length - 1; index >= 0; index--) {
      const assignment =
        this.userCommunityRoles[index]!;

      const key =
        `${assignment.userId}:${assignment.communityRoleId}`;

      if (communityKeys.has(key)) {
        this.userCommunityRoles.splice(index, 1);
      } else {
        communityKeys.add(key);
      }
    }
  }

  hasSystemRole(
    userId: UserId,
    roleId: string
  ): boolean {
    return (
      this.userSystemRoles.some(
        (assignment) =>
          assignment.userId === userId &&
          assignment.roleId === roleId
      ) ||
      this.systemRoleStore?.hasSystemRole(
        userId,
        roleId
      ) === true
    );
  }

  hasPermission(
    userId: UserId,
    permission: Permission
  ): boolean {
    return this.getUserSystemRoles(userId).some(
      (role) =>
        role.permissions.includes(permission)
    );
  }

  hasCommunityPermission(
    userId: UserId,
    communityId: CommunityId,
    permission: Permission
  ): boolean {
    return this.getUserCommunityRoles(
      userId,
      communityId
    ).some((role) =>
      role.permissions.includes(permission)
    );
  }
}