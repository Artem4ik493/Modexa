export type AutoModRuleType =
  | "keyword"
  | "link"
  | "caps"
  | "flood"
  | "invite"
  | "scam"
  | "repeated_text"
  | "emotes"
  | "mentions"
  | "zalgo";

export interface AutoModRule {
  id: string;
  communityId: string;
  type: AutoModRuleType;
  enabled: boolean;
  value?: string;
  threshold?: number;
  windowSeconds?: number;
  whitelist?: string[];
  action: "warn" | "mute" | "kick" | "ban";
}

export interface AutoModDecision {
  matched: boolean;
  rule?: AutoModRule;
  reason?: string;
}

export class AutoModService {
  private readonly rules = new Map<string, AutoModRule>();
  private readonly recentMessages = new Map<string, Array<{ content: string; at: number }>>();

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
    mentionCount?: number;
    now?: Date;
  }): AutoModDecision {
    const now = input.now ?? new Date();
    const rules = this.listRules(input.communityId).filter((rule) => rule.enabled);

    for (const rule of rules) {
      if (rule.type === "keyword" && rule.value && input.content.toLowerCase().includes(rule.value.toLowerCase())) {
        return { matched: true, rule, reason: `keyword: ${rule.value}` };
      }

      if (rule.type === "link" && /(?:https?:\/\/|www\.)[^\s]+/i.test(input.content)) {
        const links = input.content.match(/(?:https?:\/\/|www\.)[^\s]+/gi) ?? [];
        const blocked = links.some((link) =>
          !(rule.whitelist ?? []).some((pattern) => {
            const escaped = pattern.replace(/[.*+?^$()|[\]\\]/g, "\\      if (rule.type === "link" && /https?:\/\//i.test(input.content)) {
        return { matched: true, rule, reason: "link" };
      }");
            return new RegExp("^" + escaped.replace(/\\\*/g, ".*").replace(/\\\?/g, ".") + "$", "i").test(link);
          })
        );
        if (blocked) return { matched: true, rule, reason: "link" };
      }

      if (rule.type === "invite" && /(?:discord(?:app)?\.com\/invite\/|discord\.gg\/)[a-z0-9-]+/i.test(input.content)) {
        return { matched: true, rule, reason: "discord invite" };
      }

      if (rule.type === "scam" &&
        /(?:free\s+(?:nitro|gift)|steam\s+gift|claim\s+(?:your\s+)?gift|verify\s+(?:your\s+)?account)/i.test(input.content) &&
        /(?:https?:\/\/|www\.)/i.test(input.content)
      ) {
        return { matched: true, rule, reason: "scam/phishing pattern" };
      }

      if (rule.type === "caps") {
        const letters = input.content.replace(/[^a-zа-я]/gi, "");
        const upper = letters.replace(/[^A-ZА-Я]/g, "").length;
        const threshold = rule.threshold ?? 0.7;
        const minimumLetters = rule.windowSeconds ?? 8;
        if (letters.length >= minimumLetters && upper / letters.length >= threshold) {
          return { matched: true, rule, reason: "caps" };
        }
      }

      if (rule.type === "flood") {
        const key = `${input.communityId}:${input.userId}`;
        const windowMs = 10_000;
        const current = this.recentMessages.get(key) ?? [];
        const fresh = current.filter((item) => now.getTime() - item.at <= windowMs);
        const normalized = input.content.trim().toLowerCase();
        const repeated =
          rule.type === "repeated_text"
            ? fresh.filter((item) => item.content === normalized).length + 1
            : fresh.length + 1;
        fresh.push({ content: normalized, at: now.getTime() });
        this.recentMessages.set(key, fresh.slice(-100));
        if (repeated >= (rule.threshold ?? 5)) {
          return {
            matched: true,
            rule,
            reason: rule.type === "repeated_text" ? "repeated text" : "flood"
          };
        }
      }
    }

      if (rule.type === "emotes") {
        const count = [...input.content].filter((char) => {
          const code = char.codePointAt(0) ?? 0;
          return (code >= 0x1f300 && code <= 0x1faff) || (code >= 0x2600 && code <= 0x27bf);
        }).length;
        if (count >= (rule.threshold ?? 8)) {
          return { matched: true, rule, reason: "excessive emotes" };
        }
      }

      if (rule.type === "mentions" && (input as { mentionCount?: number }).mentionCount !== undefined &&
        (input as { mentionCount: number }).mentionCount >= (rule.threshold ?? 5)) {
        return { matched: true, rule, reason: "excessive mentions" };
      }

      if (rule.type === "zalgo") {
        const score = [...input.content].filter((char) => {
          const code = char.codePointAt(0) ?? 0;
          return (code >= 0x300 && code <= 0x36f) || (code >= 0x1ab0 && code <= 0x1aff) || (code >= 0x1dc0 && code <= 0x1dff);
        }).length;
        if (score >= (rule.threshold ?? 12)) {
          return { matched: true, rule, reason: "zalgo text" };
        }
      }
    }

    return { matched: false };
  }
}
