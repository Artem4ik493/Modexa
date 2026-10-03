import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AccessControlService,
  ExecutionContextService,
  MODEXA_OWNER_ROLE,
  MODEXA_OWNER_ROLE_ID,
  ModexaDatabase
} from "../src/index.js";

describe("persisted system access", () => {
  it("exposes system.manage from a database role assignment", () => {
    const directory = mkdtempSync(
      join(tmpdir(), "modexa-system-")
    );

    const database = new ModexaDatabase({
      path: join(directory, "modexa.sqlite")
    });

    const access = new AccessControlService(database);
    access.registerSystemRole(MODEXA_OWNER_ROLE);

    database.createUser({
      id: "user-1",
      displayName: "Owner",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    });

    database.assignSystemRole(
      "user-1",
      MODEXA_OWNER_ROLE_ID
    );

    const context =
      new ExecutionContextService(
        undefined,
        access
      ).create({
        platform: "telegram",
        correlationId: "test",
        user: {
          id: "user-1",
          displayName: "Owner",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z")
        }
      });

    expect(
      context.capabilities
    ).toContain("system.manage");

    database.close();
    rmSync(directory, {
      recursive: true,
      force: true
    });
  });
});
