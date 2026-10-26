import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ModexaDatabase } from "../database/service.js";
import type { BillingService } from "../billing/service.js";

const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "binary");
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;

function validateSnapshotFile(path: string): void {
  const stat = statSync(path);
  if (!stat.isFile() || stat.size < 100 || stat.size > MAX_BACKUP_BYTES) {
    throw new Error("invalid_backup_size");
  }
  const header = readFileSync(path).subarray(0, SQLITE_HEADER.length);
  if (!header.equals(SQLITE_HEADER)) throw new Error("invalid_sqlite_header");

  const candidate = new DatabaseSync(path);
  try {
    const integrity = candidate.prepare("PRAGMA integrity_check").all() as Array<{ integrity_check: string }>;
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") {
      throw new Error("backup_integrity_check_failed");
    }
    const tables = new Set((candidate.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    ).all() as Array<{ name: string }>).map((row) => row.name));
    // These are the minimum application tables needed to distinguish a Modexa
    // database from an arbitrary, otherwise-valid SQLite file.
    if (!tables.has("users") || !tables.has("communities")) {
      throw new Error("backup_schema_not_supported");
    }
  } finally {
    candidate.close();
  }
}

/**
 * Stage a validated snapshot for activation on the next controlled API start.
 * The live database is never overwritten while a DatabaseSync handle is open.
 */
export class BackupService {
  constructor(
    private readonly database: ModexaDatabase,
    private readonly billingService?: BillingService,
    private readonly communityId?: string
  ) {}

  exportSnapshot(): Buffer {
    if (this.billingService && this.communityId) {
      this.billingService.requireFeature(this.communityId, "backup");
    }
    return this.database.exportSnapshot();
  }

  stageRestore(snapshot: Buffer): { staged: true; bytes: number; restartRequired: true } {
    if (this.billingService && this.communityId) {
      this.billingService.requireFeature(this.communityId, "backup");
    }
    if (!Buffer.isBuffer(snapshot) || snapshot.byteLength < 100 || snapshot.byteLength > MAX_BACKUP_BYTES) {
      throw new Error("invalid_backup_size");
    }
    const databasePath = resolve(this.database.path);
    const pendingPath = `${databasePath}.restore-pending`;
    if (existsSync(pendingPath)) throw new Error("restore_already_staged");

    const directory = dirname(databasePath);
    mkdirSync(directory, { recursive: true });
    const temporaryPath = `${pendingPath}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporaryPath, snapshot, { flag: "wx", mode: 0o600 });
      validateSnapshotFile(temporaryPath);
      // Rename within the same directory so the staged file appears atomically.
      renameSync(temporaryPath, pendingPath);
      return { staged: true, bytes: snapshot.byteLength, restartRequired: true };
    } finally {
      rmSync(temporaryPath, { force: true });
    }
  }
}

/**
 * Called before opening the live database during process startup. Keeps the
 * previous database as a recoverable file and restores it if activation fails.
 */
export function activatePendingRestore(databasePathInput: string): { activated: boolean; backupPath?: string; rejectedPath?: string } {
  const databasePath = resolve(databasePathInput);
  const pendingPath = `${databasePath}.restore-pending`;
  if (!existsSync(pendingPath)) return { activated: false };

  try {
    validateSnapshotFile(pendingPath);
  } catch {
    const rejectedPath = `${pendingPath}.rejected-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    renameSync(pendingPath, rejectedPath);
    return { activated: false, rejectedPath };
  }
  const previousPath = `${databasePath}.pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`;
  const sidecars = ["-wal", "-shm"] as const;
  const hadPrevious = existsSync(databasePath);
  const movedSidecars: Array<{ original: string; backup: string }> = [];
  if (hadPrevious) renameSync(databasePath, previousPath);
  try {
    for (const suffix of sidecars) {
      const original = `${databasePath}${suffix}`;
      if (!existsSync(original)) continue;
      const backup = `${previousPath}${suffix}`;
      renameSync(original, backup);
      movedSidecars.push({ original, backup });
    }
    renameSync(pendingPath, databasePath);
    return { activated: true, ...(hadPrevious ? { backupPath: previousPath } : {}) };
  } catch (error) {
    if (existsSync(databasePath)) rmSync(databasePath, { force: true });
    if (hadPrevious && existsSync(previousPath)) renameSync(previousPath, databasePath);
    for (const item of movedSidecars.reverse()) {
      if (existsSync(item.backup)) renameSync(item.backup, item.original);
    }
    throw error;
  }
}
