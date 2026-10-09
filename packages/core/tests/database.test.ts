import {
  mkdtempSync,
  rmSync
} from "node:fs";

import {
  tmpdir
} from "node:os";

import {
  join
} from "node:path";

import {
  describe,
  expect,
  it
} from "vitest";

import {
  MODEXA_OWNER_ROLE_ID,
  ModexaDatabase
} from "../src/index.js";

describe("ModexaDatabase", () => {
  it("creates the database and seeds MODEXA_OWNER", () => {
    const directory =
      mkdtempSync(
        join(
          tmpdir(),
          "modexa-db-"
        )
      );

    const databasePath =
      join(
        directory,
        "modexa.sqlite"
      );

    const database =
      new ModexaDatabase({
        path:
          databasePath
      });

    expect(
      database.getSystemRole(
        MODEXA_OWNER_ROLE_ID
      )
    ).toEqual(
      expect.objectContaining({
        id:
          MODEXA_OWNER_ROLE_ID,
        name:
          "MODEXA_OWNER"
      })
    );

    database.close();

    rmSync(
      directory,
      {
        recursive:
          true,
        force:
          true
      }
    );
  });

  it("persists account settings and merges them when identities are linked", () => {
    const directory = mkdtempSync(join(tmpdir(), "modexa-user-settings-"));
    const database = new ModexaDatabase({ path: join(directory, "modexa.sqlite") });
    const now = new Date();

    database.createUser({
      id: "mx_target",
      displayName: "Target",
      createdAt: now,
      updatedAt: now
    });
    database.createUser({
      id: "mx_source",
      displayName: "Source",
      createdAt: now,
      updatedAt: now
    });

    database.setUserSetting("mx_target", "locale", "en");
    database.setUserSetting("mx_source", "theme", "dark");
    database.setUserSetting("mx_source", "locale", "ru");

    expect(database.getUserSetting("mx_target", "locale")).toBe("en");
    expect(database.getUserSettings("mx_source")).toEqual({
      locale: "ru",
      theme: "dark"
    });

    database.reassignUserReferences(["mx_source"], "mx_target");

    expect(database.getUserSettings("mx_target")).toEqual({
      locale: "en",
      theme: "dark"
    });
    expect(database.getUser("mx_source")).toBeUndefined();

    database.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
