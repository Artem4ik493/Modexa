export type AutomationTrigger =
  | { type: "interval"; intervalSeconds: number }
  | { type: "message"; pattern: string }
  | { type: "command"; command: string };

export type AutomationAction =
  | { type: "command"; command: string; args?: string[] }
  | { type: "webhook"; url: string; body?: Record<string, unknown> };

export interface Automation {
  id: string;
  communityId: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  action: AutomationAction;
  nextRunAt?: Date;
  lastRunAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
