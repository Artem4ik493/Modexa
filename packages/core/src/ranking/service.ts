export interface RankingMember {
  communityId: string;
  userId: string;
  experience: number;
  level: number;
  messages: number;
  voiceSeconds: number;
  cookies: number;
  updatedAt: Date;
}

export interface RankingReward {
  level: number;
  roleId: string;
}

export interface RankingSettings {
  enabled: boolean;
  textXp: number;
  voiceXpPerMinute: number;
  cooldownSeconds: number;
  ignoredRoleIds: string[];
  ignoredChannelIds: string[];
  rewards: RankingReward[];
}

export class RankingService {
  private readonly members = new Map<string, RankingMember>();
  private readonly settings = new Map<string, RankingSettings>();
  private readonly lastTextXp = new Map<string, number>();

  getSettings(communityId: string): RankingSettings {
    return this.settings.get(communityId) ?? {
      enabled: false,
      textXp: 10,
      voiceXpPerMinute: 5,
      cooldownSeconds: 60,
      ignoredRoleIds: [],
      ignoredChannelIds: [],
      rewards: []
    };
  }

  setSettings(communityId: string, settings: RankingSettings): void {
    this.settings.set(communityId, { ...settings, rewards: [...settings.rewards] });
  }

  awardMessageXp(input: {
    communityId: string;
    userId: string;
    channelId?: string;
    roleIds?: string[];
    now?: Date;
  }): RankingMember | undefined {
    const settings = this.getSettings(input.communityId);
    if (!settings.enabled) return undefined;
    if (input.channelId && settings.ignoredChannelIds.includes(input.channelId)) return undefined;
    if ((input.roleIds ?? []).some((roleId) => settings.ignoredRoleIds.includes(roleId))) return undefined;

    const now = input.now ?? new Date();
    const key = input.communityId + ":" + input.userId;
    const last = this.lastTextXp.get(key) ?? 0;
    if (now.getTime() - last < settings.cooldownSeconds * 1000) {
      return this.members.get(key);
    }

    this.lastTextXp.set(key, now.getTime());
    const current = this.members.get(key) ?? {
      communityId: input.communityId,
      userId: input.userId,
      experience: 0,
      level: 0,
      messages: 0,
      voiceSeconds: 0,
      cookies: 0,
      updatedAt: now
    };

    current.experience += settings.textXp;
    current.messages += 1;
    current.level = this.levelForExperience(current.experience);
    current.updatedAt = now;
    this.members.set(key, current);
    return { ...current };
  }

  awardVoiceXp(communityId: string, userId: string, minutes: number, now = new Date()): RankingMember {
    const settings = this.getSettings(communityId);
    const key = communityId + ":" + userId;
    const current = this.members.get(key) ?? {
      communityId,
      userId,
      experience: 0,
      level: 0,
      messages: 0,
      voiceSeconds: 0,
      cookies: 0,
      updatedAt: now
    };

    current.experience += Math.max(0, minutes) * settings.voiceXpPerMinute;
    current.voiceSeconds += Math.max(0, minutes) * 60;
    current.level = this.levelForExperience(current.experience);
    current.updatedAt = now;
    this.members.set(key, current);
    return { ...current };
  }

  addCookies(communityId: string, userId: string, amount = 1, now = new Date()): RankingMember {
    const key = communityId + ":" + userId;
    const current = this.members.get(key) ?? {
      communityId, userId, experience: 0, level: 0, messages: 0, voiceSeconds: 0, cookies: 0, updatedAt: now
    };
    current.cookies = Math.max(0, current.cookies + amount);
    current.updatedAt = now;
    this.members.set(key, current);
    return { ...current };
  }

  getMember(communityId: string, userId: string): RankingMember | undefined {
    return this.members.get(communityId + ":" + userId);
  }

  leaders(communityId: string, limit = 10): RankingMember[] {
    return [...this.members.values()]
      .filter((member) => member.communityId === communityId)
      .sort((a, b) => b.experience - a.experience)
      .slice(0, Math.max(1, Math.min(100, limit)))
      .map((member) => ({ ...member }));
  }

  resetMember(communityId: string, userId: string): void {
    this.members.delete(communityId + ":" + userId);
  }

  private levelForExperience(experience: number): number {
    return Math.max(0, Math.floor(Math.sqrt(Math.max(0, experience) / 100)));
  }
}
