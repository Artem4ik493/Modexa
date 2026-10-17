export type AutoModRuleType =
  | "keyword" | "link" | "invite" | "scam" | "caps" | "flood"
  | "repeated_text" | "emotes" | "mentions" | "zalgo";

export interface AutoModRule {
  id: string; communityId: string; type: AutoModRuleType; enabled: boolean;
  value?: string; threshold?: number; windowSeconds?: number; whitelist?: string[];
  ignoredUserIds?: string[]; ignoredChannelIds?: string[];
  action: "warn" | "mute" | "kick" | "ban" | "delete";
}

export interface AutoModDecision { matched: boolean; rule?: AutoModRule; reason?: string; }

function wildcard(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, (character) => "\\" + character).replaceAll("*", ".*");
  return new RegExp("^" + escaped + "$", "i").test(value);
}

function isWhitelistedLink(link: string, patterns: string[]): boolean {
  let hostname = "";
  try { hostname = new URL(link.startsWith("www.") ? "https://" + link : link).hostname.toLowerCase(); } catch { /* compare the raw value below */ }
  return patterns.some((pattern) => {
    const candidate = pattern.trim().toLowerCase();
    if (!candidate) return false;
    if (wildcard(link.toLowerCase(), candidate)) return true;
    const domainPattern = candidate.replace(/^(?:https?:\\/\\/)?/, "").replace(/^www\\./, "").split(/[/?#]/, 1)[0] ?? "";
    const domain = hostname.replace(/^www\\./, "");
    return Boolean(domainPattern && domain && (domain === domainPattern || domain.endsWith("." + domainPattern) || wildcard(domain, domainPattern)));
  });
}

export class AutoModService {
  private readonly rules = new Map<string, AutoModRule>();
  private readonly recentMessages = new Map<string, Array<{ content: string; at: number }>>();

  upsertRule(rule: AutoModRule): void { this.rules.set(rule.id, { ...rule, whitelist: rule.whitelist ? [...rule.whitelist] : undefined, ignoredUserIds: rule.ignoredUserIds ? [...rule.ignoredUserIds] : undefined, ignoredChannelIds: rule.ignoredChannelIds ? [...rule.ignoredChannelIds] : undefined }); }
  removeRule(ruleId: string): void { this.rules.delete(ruleId); }
  listRules(communityId: string): AutoModRule[] { return [...this.rules.values()].filter((rule) => rule.communityId === communityId); }

  inspect(input: { communityId: string; userId: string; channelId?: string; content: string; mentionCount?: number; now?: Date }): AutoModDecision {
    const now = input.now ?? new Date();
    for (const rule of this.listRules(input.communityId).filter((item) => item.enabled)) {\n      if ((rule.ignoredUserIds ?? []).includes(input.userId) || (input.channelId && (rule.ignoredChannelIds ?? []).includes(input.channelId))) continue;
      const content = input.content.trim();
      const lower = content.toLowerCase();
      if (rule.type === "keyword" && rule.value) {
        const keywords = rule.value.split("|").map((item) => item.trim().toLowerCase()).filter(Boolean);
        if (keywords.some((keyword) => lower.includes(keyword))) return { matched: true, rule, reason: "keyword" };
      }
      if (rule.type === "link" && /(?:https?:\/\/|www\.)[^\s]+/i.test(content)) {
        const links = content.match(/(?:https?:\/\/|www\.)[^\s]+/gi) ?? [];
        if (links.some((link) => !isWhitelistedLink(link, rule.whitelist ?? []))) return { matched: true, rule, reason: "link" };
      }
      if (rule.type === "invite" && /(?:discord(?:app)?\.com\/invite\/|discord\.gg\/)[a-z0-9-]+/i.test(content)) return { matched: true, rule, reason: "discord invite" };
      if (rule.type === "scam" && /(?:free\s+(?:nitro|gift)|steam\s+gift|claim\s+(?:your\s+)?gift|verify\s+(?:your\s+)?account)/i.test(content) && /https?:\/\//i.test(content)) return { matched: true, rule, reason: "scam/phishing" };
      if (rule.type === "caps") {
        const letters = content.replace(/[^a-zа-яё]/gi, "");
        const upper = letters.replace(/[^A-ZА-ЯЁ]/g, "").length;
        if (letters.length >= (rule.windowSeconds ?? 10) && upper / letters.length >= (rule.threshold ?? 0.7)) return { matched: true, rule, reason: "caps" };
      }
      if (rule.type === "flood" || rule.type === "repeated_text") {
        const key = input.communityId + ":" + input.userId;
        const windowMs = (rule.windowSeconds ?? 10) * 1000;
        const history = (this.recentMessages.get(key) ?? []).filter((item) => now.getTime() - item.at <= windowMs);
        const count = rule.type === "repeated_text" ? history.filter((item) => item.content === lower).length + 1 : history.length + 1;
        history.push({ content: lower, at: now.getTime() });
        this.recentMessages.set(key, history.slice(-100));
        if (count >= (rule.threshold ?? 5)) return { matched: true, rule, reason: rule.type };
      }
      if (rule.type === "emotes") {
        const count = [...content].filter((char) => { const code = char.codePointAt(0) ?? 0; return (code >= 0x1f300 && code <= 0x1faff) || (code >= 0x2600 && code <= 0x27bf); }).length;
        if (count >= (rule.threshold ?? 8)) return { matched: true, rule, reason: "emotes" };
      }
      if (rule.type === "mentions" && (input.mentionCount ?? 0) >= (rule.threshold ?? 5)) return { matched: true, rule, reason: "mentions" };
      if (rule.type === "zalgo") {
        const score = [...content].filter((char) => { const code = char.codePointAt(0) ?? 0; return (code >= 0x300 && code <= 0x36f) || (code >= 0x1ab0 && code <= 0x1aff) || (code >= 0x1dc0 && code <= 0x1dff); }).length;
        if (score >= (rule.threshold ?? 12)) return { matched: true, rule, reason: "zalgo" };
      }
    }
    return { matched: false };
  }
}