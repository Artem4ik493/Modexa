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
});
