import type { CommunityId } from "../communities/types.js";
import type { UserId } from "../identity/types.js";
import type {
  CommunityRole,
  Permission,
  SystemRole,
  UserCommunityRole,
  UserSystemRole
} from "./types.js";

export class AccessControlService {
  private readonly systemRoles = new Map<
    string,
    SystemRole
  >();

  private readonly communityRoles = new Map<
    string,
    CommunityRole
  >();

  private readonly userSystemRoles: UserSystemRole[] = [];
  private readonly userCommunityRoles: UserCommunityRole[] = [];

  registerSystemRole(role: SystemRole): void {
    this.systemRoles.set(role.id, role);
  }

  registerCommunityRole(
    role: CommunityRole
  ): void {
    this.communityRoles.set(role.id, role);
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

  hasSystemRole(
    userId: UserId,
    roleId: string
  ): boolean {
    return this.userSystemRoles.some(
      (assignment) =>
        assignment.userId === userId &&
        assignment.roleId === roleId
    );
  }

  hasPermission(
    userId: UserId,
    permission: Permission
  ): boolean {
    const systemRoleIds =
      this.userSystemRoles
        .filter(
          (assignment) =>
            assignment.userId === userId
        )
        .map(
          (assignment) => assignment.roleId
        );

    return systemRoleIds.some((roleId) => {
      const role = this.systemRoles.get(roleId);

      return role?.permissions.includes(
        permission
      ) ?? false;
    });
  }

  hasCommunityPermission(
    userId: UserId,
    communityId: CommunityId,
    permission: Permission
  ): boolean {
    const roleIds =
      this.userCommunityRoles
        .filter(
          (assignment) =>
            assignment.userId === userId
        )
        .map(
          (assignment) =>
            assignment.communityRoleId
        );

    return roleIds.some((roleId) => {
      const role = this.communityRoles.get(
        roleId
      );

      if (!role) {
        return false;
      }

      if (role.communityId !== communityId) {
        return false;
      }

      return role.permissions.includes(
        permission
      );
    });
  }
}