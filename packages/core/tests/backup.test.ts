import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BackupService, activatePendingRestore, ModexaDatabase } from "../src/index.js";

const directories: string[] = [];
function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "modexa-backup-test-"));
  directories.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("BackupService restore", () => {
  it("stages a valid SQLite snapshot and activates it on restart while retaining the previous database", () => {
    const directory = temporaryDirectory();
    const targetPath = join(directory, "target.sqlite");
    const sourcePath = join(directory, "source.sqlite");
    const now = new Date();

    const target = new ModexaDatabase({ path: targetPath });
    target.upsertCommunity({ id: "old-community", name: "Old", createdAt: now, updatedAt: now });
    target.setCommunitySetting("old-community", "marker", "keep-as-backup");
    const targetBackup = new BackupService(target);

    const source = new ModexaDatabase({ path: sourcePath });
    source.upsertCommunity({ id: "restored-community", name: "Restored", createdAt: now, updatedAt: now });
    source.setCommunitySetting("restored-community", "marker", "restored-value");
    const snapshot = source.exportSnapshot();
    source.close();

    expect(targetBackup.stageRestore(snapshot)).toEqual({
      staged: true,
      bytes: snapshot.byteLength,
      restartRequired: true
    });
    expect(existsSync(`${targetPath}.restore-pending`)).toBe(true);

    target.close();
    const activation = activatePendingRestore(targetPath);
    expect(activation.activated).toBe(true);
    expect(activation.backupPath).toBeTruthy();
    expect(existsSync(activation.backupPath!)).toBe(true);

    const restored = new ModexaDatabase({ path: targetPath });
    expect(restored.getCommunitySetting("restored-community", "marker")).toBe("restored-value");
    restored.close();

    const previous = new ModexaDatabase({ path: activation.backupPath! });
    expect(previous.getCommunitySetting("old-community", "marker")).toBe("keep-as-backup");
    previous.close();
  });

  it("rejects non-SQLite uploads and does not stage them", () => {
    const directory = temporaryDirectory();
    const database = new ModexaDatabase({ path: join(directory, "target.sqlite") });
    const backup = new BackupService(database);

    expect(() => backup.stageRestore(Buffer.from("not a database"))).toThrow("invalid_backup_size");
    expect(existsSync(`${database.path}.restore-pending`)).toBe(false);

    database.close();
  });

  it("does not overwrite an already staged restore", () => {
    const directory = temporaryDirectory();
    const database = new ModexaDatabase({ path: join(directory, "target.sqlite") });
    const source = new ModexaDatabase({ path: join(directory, "source.sqlite") });
    const snapshot = source.exportSnapshot();
    const backup = new BackupService(database);

    backup.stageRestore(snapshot);
    expect(() => backup.stageRestore(snapshot)).toThrow("restore_already_staged");

    source.close();
    database.close();
  });

  it("does not activate a restore when no staged snapshot exists", () => {
    const directory = temporaryDirectory();
    expect(activatePendingRestore(join(directory, "missing.sqlite"))).toEqual({ activated: false });
  });
});
