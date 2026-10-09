import { randomUUID } from "node:crypto";
import type { Automation, AutomationAction, AutomationTrigger } from "./types.js";
import type { BillingService } from "../billing/service.js";

export interface AutomationStateStore {
  getRuntimeState<T>(key: string): T | undefined;
  setRuntimeState(key: string, value: unknown, now?: Date): void;
  getCommunitySetting?(communityId: string, key: string): string | undefined;
}

const STATE_KEY = "automations";

type StoredAutomation = Omit<Automation, "createdAt" | "updatedAt" | "nextRunAt" | "lastRunAt"> & {
  createdAt: string;
  updatedAt: string;
  nextRunAt?: string;
  lastRunAt?: string;
};

export class AutomationService {
  private readonly automations = new Map<string, Automation>();

  constructor(
    private readonly billingService?: BillingService,
    private readonly store?: AutomationStateStore
  ) {
    for (const item of store?.getRuntimeState<StoredAutomation[]>(STATE_KEY) ?? []) {
      const restored: Automation = {
        id: item.id,
        communityId: item.communityId,
        name: item.name,
        enabled: item.enabled,
        trigger: item.trigger,
        action: item.action,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
        ...(item.nextRunAt ? { nextRunAt: new Date(item.nextRunAt) } : {}),
        ...(item.lastRunAt ? { lastRunAt: new Date(item.lastRunAt) } : {})
      };
      this.automations.set(restored.id, restored);
    }
  }

  create(input: {
    communityId: string;
    name: string;
    trigger: AutomationTrigger;
    action: AutomationAction;
    now?: Date;
  }): Automation {
    this.billingService?.requireFeature(input.communityId, "automations");
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
    this.persist(now);
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
    this.persist(now);
    return item;
  }

  markRun(id: string, now = new Date()): Automation {
    const item = this.require(id);
    item.lastRunAt = now;
    if (item.trigger.type === "interval") {
      item.nextRunAt = new Date(now.getTime() + item.trigger.intervalSeconds * 1000);
    }
    item.updatedAt = now;
    this.persist(now);
    return item;
  }

  getDue(now = new Date()): Automation[] {
    return [...this.automations.values()].filter(
      (item) =>
        this.store?.getCommunitySetting?.(item.communityId, "automations.enabled") !== "false" &&
        item.enabled &&
        item.trigger.type === "interval" &&
        !!item.nextRunAt &&
        item.nextRunAt <= now
    );
  }

  matchMessage(communityId: string, content: string): Automation[] {
    if (this.store?.getCommunitySetting?.(communityId, "automations.enabled") === "false") {
      return [];
    }
    return this.list(communityId).filter(
      (item) =>
        item.enabled &&
        item.trigger.type === "message" &&
        content.toLowerCase().includes(item.trigger.pattern.toLowerCase())
    );
  }

  private persist(now = new Date()): void {
    this.store?.setRuntimeState(
      STATE_KEY,
      [...this.automations.values()].map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        ...(item.nextRunAt ? { nextRunAt: item.nextRunAt.toISOString() } : {}),
        ...(item.lastRunAt ? { lastRunAt: item.lastRunAt.toISOString() } : {})
      })),
      now
    );
  }

  private require(id: string): Automation {
    const item = this.automations.get(id);
    if (!item) throw new Error(`Automation "${id}" does not exist`);
    return item;
  }
}
