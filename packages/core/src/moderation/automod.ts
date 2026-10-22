export type AutoModRuleType =
  | "keyword" | "link" | "invite" | "scam" | "caps" | "flood"
  | "repeated_text" | "emotes" | "mentions" | "zalgo";

export interface AutoModRule {
  id: string; communityId: string; type: AutoModRuleType; enabled: boolean;
  value?: string; threshold?: number; windowSeconds?: number; durationSeconds?: number; whitelist?: string[];
  linkMode?: "all" | "suspicious" | "allowlist";
  ignoredUserIds?: string[]; ignoredChannelIds?: string[]; ignoredRoleIds?: string[];
  action: "warn" | "mute" | "kick" | "ban" | "delete";
}

export interface AutoModDecision { matched: boolean; rule?: AutoModRule; reason?: string; }

function wildcard(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, (character) => "\\" + character).replaceAll("*", ".*");
  return new RegExp("^" + escaped + "$", "i").test(value);
}

function isWhitelistedLink(link: string, patterns: string[]): boolean {
  let hostname = "";
  try { hostname = new URL(/^https?:\/\//i.test(link) ? link : "https://" + link).hostname.toLowerCase(); } catch { /* compare the raw value below */ }
  return patterns.some((pattern) => {
    const candidate = pattern.trim().toLowerCase();
    if (!candidate) return false;
    if (wildcard(link.toLowerCase(), candidate)) return true;
    const withoutProtocol = candidate.startsWith("https://") ? candidate.slice(8) : candidate.startsWith("http://") ? candidate.slice(7) : candidate;
    const domainPattern = withoutProtocol.replace(/^www\./, "").split(/[/?#]/, 1)[0] ?? "";
    const domain = hostname.replace(/^www\./, "");
    return Boolean(domainPattern && domain && (domain === domainPattern || domain.endsWith("." + domainPattern) || wildcard(domain, domainPattern)));
  });
}

export class AutoModService {
  private readonly rules = new Map<string, AutoModRule>();
  private readonly recentMessages = new Map<string, Array<{ content: string; at: number }>>();

  private readonly threatCache = new Map<string, { malicious: boolean; checkedAt: number }>();
  private readonly threatRequests = new Map<string, Promise<boolean>>();

  private extractLinks(content: string): string[] {
    return (content.match(/(?<![@\w.-])(?:https?:\/\/|www\.)[^\s<>()[\]{}]+|(?<![@\w.-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>()[\]{}]*)?/gi) ?? [])
      .map((link) => link.replace(/[.,!?;:]+$/g, "").replace(/[)\]}]+$/g, ""));
  }

  private async lookupThreat(url: string): Promise<boolean> {
    let normalized: string;
    try { normalized = new URL(/^https?:\/\//i.test(url) ? url : "https://" + url).toString(); }
    catch { return false; }
    const now = Date.now();
    const cached = this.threatCache.get(normalized);
    if (cached && now - cached.checkedAt < (cached.malicious ? 60 * 60_000 : 15 * 60_000)) return cached.malicious;
    const pending = this.threatRequests.get(normalized);
    if (pending) return pending;
    const request = (async () => {
      let malicious = false;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        try {
          const response = await fetch("https://openphish.eu/api/check?url=" + encodeURIComponent(normalized), {
            headers: { accept: "application/json", "user-agent": "Modexa-AutoMod/1.0" },
            signal: controller.signal
          });
          if (response.ok) {
            const data = await response.json() as { found?: boolean; phish?: { status?: string } };
            malicious = data.found === true && (!data.phish?.status || data.phish.status === "verified");
          }
        } finally { clearTimeout(timeout); }
      } catch { /* provider failure is fail-open */ }

      const key = typeof process !== "undefined" ? process.env.PHISHTANK_API_KEY : undefined;
      if (!malicious && key) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2500);
          try {
            const response = await fetch("https://checkurl.phishtank.com/checkurl/", {
              method: "POST",
              headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", "user-agent": "Modexa-AutoMod/1.0" },
              body: new URLSearchParams({ url: normalized, app_key: key, format: "json" }),
              signal: controller.signal
            });
            if (response.ok) {
              const data = await response.json() as { results?: { url?: { in_database?: string; verified?: string; valid?: string } } };
              const result = data.results?.url;
              malicious = result?.in_database === "true" && result.verified === "y" && result.valid === "y";
            }
          } finally { clearTimeout(timeout); }
        } catch { /* optional provider failure is fail-open */ }
      }
      this.threatCache.set(normalized, { malicious, checkedAt: Date.now() });
      if (this.threatCache.size > 2000) {
        const oldest = [...this.threatCache.entries()].sort((a, b) => a[1].checkedAt - b[1].checkedAt).slice(0, 500);
        for (const [key] of oldest) this.threatCache.delete(key);
      }
      return malicious;
    })();
    this.threatRequests.set(normalized, request);
    try { return await request; } finally { this.threatRequests.delete(normalized); }
  }

  async inspectAsync(input: { communityId: string; userId: string; channelId?: string; roleIds?: string[]; content: string; mentionCount?: number; now?: Date }): Promise<AutoModDecision> {
    const regular = this.inspect(input);
    if (regular.matched) return regular;
    const applicable = this.listRules(input.communityId).filter((rule) => {
      if (!rule.enabled || (rule.type !== "link" && rule.type !== "scam")) return false;
      if ((rule.ignoredUserIds ?? []).includes(input.userId) ||
          (input.channelId && (rule.ignoredChannelIds ?? []).includes(input.channelId)) ||
          (input.roleIds ?? []).some((roleId) => (rule.ignoredRoleIds ?? []).includes(roleId))) return false;
      return rule.type === "scam" || rule.linkMode === "suspicious";
    });
    if (!applicable.length) return regular;
    const links = this.extractLinks(input.content);
    if (!links.length) return regular;
    for (const link of links) {
      if (await this.lookupThreat(link)) {
        const rule = applicable.find((candidate) => candidate.type === "link") ?? applicable.find((candidate) => candidate.type === "scam");
        if (rule) return { matched: true, rule, reason: "known phishing URL (OpenPhish/PhishTank)" };
      }
    }
    return regular;
  }


  private ruleKey(communityId: string, ruleId: string): string { return `${communityId}:${ruleId}`; }

  upsertRule(rule: AutoModRule): void { this.rules.set(this.ruleKey(rule.communityId, rule.id), { ...rule, whitelist: rule.whitelist ? [...rule.whitelist] : undefined, ignoredUserIds: rule.ignoredUserIds ? [...rule.ignoredUserIds] : undefined, ignoredChannelIds: rule.ignoredChannelIds ? [...rule.ignoredChannelIds] : undefined, ignoredRoleIds: rule.ignoredRoleIds ? [...rule.ignoredRoleIds] : undefined }); }
  removeRule(ruleId: string, communityId?: string): void {
    if (communityId !== undefined) { this.rules.delete(this.ruleKey(communityId, ruleId)); return; }
    for (const [key, rule] of this.rules) if (rule.id === ruleId) this.rules.delete(key);
  }
  syncCommunityRules(communityId: string, rules: AutoModRule[]): void {
    for (const [key, rule] of this.rules) {
      if (rule.communityId === communityId) this.rules.delete(key);
    }
    for (const rule of rules) {
      if (rule && rule.communityId === communityId && typeof rule.id === "string") this.upsertRule(rule);
    }
  }

  listRules(communityId: string): AutoModRule[] { return [...this.rules.values()].filter((rule) => rule.communityId === communityId); }

  inspect(input: { communityId: string; userId: string; channelId?: string; roleIds?: string[]; content: string; mentionCount?: number; now?: Date }): AutoModDecision {
    const now = input.now ?? new Date();
    for (const rule of this.listRules(input.communityId).filter((item) => item.enabled)) {
      if ((rule.ignoredUserIds ?? []).includes(input.userId) || (input.channelId && (rule.ignoredChannelIds ?? []).includes(input.channelId)) || (input.roleIds ?? []).some((roleId) => (rule.ignoredRoleIds ?? []).includes(roleId))) continue;
      const content = input.content.trim();
      const lower = content.toLowerCase();
      if (rule.type === "keyword" && rule.value) {
        const keywords = rule.value.split("|").map((item) => item.trim().toLowerCase()).filter(Boolean);
        if (keywords.some((keyword) => lower.includes(keyword))) return { matched: true, rule, reason: "keyword" };
      }
      if (rule.type === "link" && rule.linkMode !== "suspicious") {
        const links = this.extractLinks(content);
        if (rule.linkMode === "all" && links.length > 0) return { matched: true, rule, reason: "link" };
        if (links.some((link) => !isWhitelistedLink(link, rule.whitelist ?? []))) return { matched: true, rule, reason: "link" };
      }
      if (rule.type === "invite" && /(?:discord(?:app)?\.com\/invite\/|discord\.gg\/|t\.me\/(?:\+|joinchat\/)|telegram\.me\/joinchat\/)[a-z0-9_-]+/i.test(content)) return { matched: true, rule, reason: "platform invite" };
      if (rule.type === "scam" && /(?:free\s+(?:nitro|gift)|steam\s+gift|claim\s+(?:your\s+)?gift|verify\s+(?:your\s+)?account|бесплатн[а-яё]*\s+(?:нитро|подарок)|получ[а-яё]*\s+(?:свой\s+)?подарок|подтверд[а-яё]*\s+(?:свой\s+)?аккаунт)/i.test(content) && /(?:https?:\/\/|www\.|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b)/i.test(content)) return { matched: true, rule, reason: "scam/phishing" };
      if (rule.type === "caps") {
        const letters = content.replace(/[^a-zа-яё]/gi, "");
        const upper = letters.replace(/[^A-ZА-ЯЁ]/g, "").length;
        if (letters.length >= (rule.windowSeconds ?? 5) && upper / letters.length >= (rule.threshold ?? 0.7)) return { matched: true, rule, reason: "caps" };
      }
      if (rule.type === "flood" || rule.type === "repeated_text") {
        const key = rule.id + ":" + input.communityId + ":" + (input.channelId ?? "all") + ":" + input.userId;
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