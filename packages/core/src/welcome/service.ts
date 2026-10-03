export interface WelcomeSettings {
  enabled: boolean;
  channelId?: string;
  message: string;
  leaveEnabled: boolean;
  leaveMessage: string;
  startingRoleIds: string[];
  restoreRolesOnRejoin: boolean;
  restoreNicknameOnRejoin: boolean;
}

export interface WelcomeMemberSnapshot {
  userId: string;
  nickname?: string;
  roleIds: string[];
  leftAt?: Date;
}

export class WelcomeService {
  private readonly settings = new Map<string, WelcomeSettings>();
  private readonly departed = new Map<string, { communityId: string; snapshot: WelcomeMemberSnapshot }>();

  getSettings(communityId: string): WelcomeSettings {
    return this.settings.get(communityId) ?? {
      enabled: false,
      message: "Добро пожаловать, {{ member }}!",
      leaveEnabled: false,
      leaveMessage: "{{ member }} покинул сервер.",
      startingRoleIds: [],
      restoreRolesOnRejoin: true,
      restoreNicknameOnRejoin: true
    };
  }

  setSettings(communityId: string, settings: WelcomeSettings): void {
    this.settings.set(communityId, {
      ...settings,
      startingRoleIds: [...settings.startingRoleIds]
    });
  }

  recordDeparture(communityId: string, snapshot: WelcomeMemberSnapshot): void {
    this.departed.set(communityId + ":" + snapshot.userId, {
      communityId,
      snapshot: {
        ...snapshot,
        roleIds: [...snapshot.roleIds],
        leftAt: new Date()
      }
    });
  }

  resolveJoin(communityId: string, userId: string): {
    restoreRoleIds: string[];
    restoreNickname?: string;
    applyStartingRoles: boolean;
  } {
    const record = this.departed.get(communityId + ":" + userId);
    const snapshot = record?.snapshot;
    if (!snapshot) {
      return { restoreRoleIds: [], applyStartingRoles: true };
    }

    this.departed.delete(communityId + ":" + userId);
    const settings = this.getSettings(communityId);

    if (!settings) {
      return { restoreRoleIds: [], applyStartingRoles: true };
    }

    return {
      restoreRoleIds: settings.restoreRolesOnRejoin ? snapshot.roleIds : [],
      restoreNickname: settings.restoreNicknameOnRejoin ? snapshot.nickname : undefined,
      applyStartingRoles: !settings.restoreRolesOnRejoin || snapshot.roleIds.length === 0
    };
  }

  render(template: string, variables: Record<string, string>): string {
    return template.replace(/{{\\s*([a-zA-Z0-9_.-]+)\\s*}}/g, (_, key: string) => variables[key] ?? "");
  }
}
