export type AutoModRuleType =
  | "keyword"
  | "link"
  | "caps"
  | "flood";

export interface AutoModRule {
  id: string;
  communityId: string;
  type: AutoModRuleType;
  enabled: boolean;
  value?: string;
  threshold?: number;
  action: "warn" | "mute" | "kick" | "ban";
}

export interface AutoModDecision {
  matched: boolean;
  rule?: AutoModRule;
  reason?: string;
}

export class AutoModService {
  private readonly rules = new Map<string, AutoModRule>();
  private readonly recentMessages = new Map<string, number[]>();

  upsertRule(rule: AutoModRule): void {
    this.rules.set(rule.id, { ...rule });
  }

  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  listRules(communityId: string): AutoModRule[] {
    return [...this.rules.values()].filter((rule) => rule.communityId === communityId);
  }

  inspect(input: {
    communityId: string;
    userId: string;
    content: string;
    now?: Date;
  }): AutoModDecision {
    const now = input.now ?? new Date();
    const rules = this.listRules(input.communityId).filter((rule) => rule.enabled);

    for (const rule of rules) {
      if (rule.type === "keyword" && rule.value && input.content.toLowerCase().includes(rule.value.toLowerCase())) {
        return { matched: true, rule, reason: `keyword: ${rule.value}` };
      }

      if (rule.type === "link" && /https?:\/\//i.test(input.content)) {
        return { matched: true, rule, reason: "link" };
      }

      if (rule.type === "caps") {
        const letters = input.content.replace(/[^a-zа-я]/gi, "");
        const upper = letters.replace(/[^A-ZА-Я]/g, "").length;
        const threshold = rule.threshold ?? 0.7;
        if (letters.length >= 8 && upper / letters.length >= threshold) {
          return { matched: true, rule, reason: "caps" };
        }
      }

      if (rule.type === "flood") {
        const key = `${input.communityId}:${input.userId}`;
        const windowMs = 10_000;
        const current = this.recentMessages.get(key) ?? [];
        const fresh = current.filter((time) => now.getTime() - time <= windowMs);
        fresh.push(now.getTime());
        this.recentMessages.set(key, fresh);
        if (fresh.length >= (rule.threshold ?? 5)) {
          return { matched: true, rule, reason: "flood" };
        }
      }
    }

    return { matched: false };
  }
}
