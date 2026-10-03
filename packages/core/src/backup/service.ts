import { gzipSync } from "node:zlib";
import type { ModexaDatabase } from "../database/service.js";

export interface BackupArtifact {
  createdAt: Date;
  databasePath: string;
  compressed: boolean;
  data: string;
}

export class BackupService {
  constructor(private readonly database: ModexaDatabase) {}

  exportSnapshot(): BackupArtifact {
    const snapshot = this.database.exportSnapshot();
    const compressed = gzipSync(Buffer.from(snapshot, "utf8")).toString("base64");
    return {
      createdAt: new Date(),
      databasePath: this.database.path,
      compressed: true,
      data: compressed
    };
  }

  restoreSnapshot(_base64: string): void {
    throw new Error("Restore requires restarting Modexa with a replacement database file");
  }
}
