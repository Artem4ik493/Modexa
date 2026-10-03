import { randomUUID } from "node:crypto";
import type { Automation, AutomationAction, AutomationTrigger } from "./types.js";

export class AutomationService {
  private readonly automations = new Map<string, Automation>();

  create(input: {
    communityId: string;
    name: string;
    trigger: AutomationTrigger;
    action: AutomationAction;
    now?: Date;
  }): Automation {
    if (!input.name.trim()) throw new Error("Automation name is required");
    if (input.trigger.type === "interval" && input.trigger.intervalSeconds < 60) {
      throw new Error("Automation interval must be at least 60 seconds");
    }
    const now = input.now ?? new Date();
    const item: Automation = {
      id: `automation-${randomUUID()}`,
      communityId: input.communityId,
      name: input.name.trim(),
      enabled: true,
      trigger: input.trigger,
      action: input.action,
      nextRunAt:
        input.trigger.type === "interval"
          ? new Date(now.getTime() + input.trigger.intervalSeconds * 1000)
          : undefined,
      createdAt: now,
      updatedAt: now
    };
    this.automations.set(item.id, item);
    return item;
  }

  get(id: string): Automation | undefined { return this.automations.get(id); }
  list(communityId?: string): Automation[] {
    return [...this.automations.values()]
      .filter((item) => !communityId || item.communityId === communityId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  setEnabled(id: string, enabled: boolean, now = new Date()): Automation {
    const item = this.require(id);
    item.enabled = enabled;
    item.updatedAt = now;
    return item;
  }

  markRun(id: string, now = new Date()): Automation {
    const item = this.require(id);
    item.lastRunAt = now;
    if (item.trigger.type === "interval") {
      item.nextRunAt = new Date(now.getTime() + item.trigger.intervalSeconds * 1000);
    }
    item.updatedAt = now;
    return item;
  }

  getDue(now = new Date()): Automation[] {
    return [...this.automations.values()].filter(
      (item) => item.enabled && item.trigger.type === "interval" && !!item.nextRunAt && item.nextRunAt <= now
    );
  }

  matchMessage(communityId: string, content: string): Automation[] {
    return this.list(communityId).filter(
      (item) =>
        item.enabled &&
        item.trigger.type === "message" &&
        content.toLowerCase().includes(item.trigger.pattern.toLowerCase())
    );
  }

  private require(id: string): Automation {
    const item = this.automations.get(id);
    if (!item) throw new Error(`Automation "${id}" does not exist`);
    return item;
  }
}
