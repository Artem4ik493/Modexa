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
}

export class AccessControlService {
  constructor(
    private readonly systemRoleStore?: SystemRoleAssignmentStore
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
  }

  revokeSystemRole(
    userId: UserId,
    roleId: string
  ): void {
    const index =
      this.userSystemRoles.findIndex(
        (assignment) =>
          assignment.userId === userId &&
          assignment.roleId === roleId
      );

    if (index === -1) {
      return;
    }

    this.userSystemRoles.splice(index, 1);
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
      return;
    }

    this.userCommunityRoles.splice(index, 1);
  }

  getUserSystemRoles(
    userId: UserId
  ): SystemRole[] {
    return this.userSystemRoles
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
    return this.userCommunityRoles
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
      );
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