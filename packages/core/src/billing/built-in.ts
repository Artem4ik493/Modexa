import type { Plan } from "./types.js";

export const FREE_PLAN_ID = "free";
export const PRO_PLAN_ID = "pro";

export const FREE_PLAN: Plan = {
  id: FREE_PLAN_ID,
  name: "FREE",
  entitlements: [
    {
      feature: "basic_commands",
      enabled: true
    },
    {
      feature: "basic_moderation",
      enabled: true
    },
    {
      feature: "advanced_moderation",
      enabled: false
    },
    {
      feature: "automod",
      enabled: false
    },
    {
      feature: "bridge",
      enabled: false
    },
    {
      feature: "automations",
      enabled: false
    },
    {
      feature: "analytics",
      enabled: false
    },
    {
      feature: "backup",
      enabled: false
    }
  ],
  createdAt: new Date(0),
  updatedAt: new Date(0)
};

export const PRO_PLAN: Plan = {
  id: PRO_PLAN_ID,
  name: "PRO",
  entitlements: [
    {
      feature: "basic_commands",
      enabled: true
    },
    {
      feature: "basic_moderation",
      enabled: true
    },
    {
      feature: "advanced_moderation",
      enabled: true
    },
    {
      feature: "automod",
      enabled: true
    },
    {
      feature: "bridge",
      enabled: true
    },
    {
      feature: "automations",
      enabled: true
    },
    {
      feature: "analytics",
      enabled: true
    },
    {
      feature: "backup",
      enabled: true
    }
  ],
  createdAt: new Date(0),
  updatedAt: new Date(0)
};

export function createBuiltinPlans(): Plan[] {
  return [
    {
      ...FREE_PLAN,
      entitlements: [
        ...FREE_PLAN.entitlements
      ]
    },
    {
      ...PRO_PLAN,
      entitlements: [
        ...PRO_PLAN.entitlements
      ]
    }
  ];
}