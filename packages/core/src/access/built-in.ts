import type { SystemRole } from "./types.js";

export const MODEXA_OWNER_ROLE_ID =
  "modexa-owner";

export const MODEXA_OWNER_ROLE: SystemRole = {
  id: MODEXA_OWNER_ROLE_ID,
  name: "MODEXA_OWNER",
  permissions: [
    "system.users.manage",
    "system.communities.manage",
    "system.subscriptions.manage",
    "system.backup.create",
    "system.backup.restore",
    "system.identity.unlink"
  ]
};

export function createBuiltinSystemRoles(): SystemRole[] {
  return [
    MODEXA_OWNER_ROLE
  ];
}