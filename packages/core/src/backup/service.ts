import type { ModexaDatabase } from "../database/service.js";
import type { BillingService } from "../billing/service.js";

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

  // A running SQLite database must never be overwritten in place. Restore is
  // intentionally staged for a controlled restart instead of replacing the
  // file currently held open by the process.
  restoreSnapshot(_base64: string): void {
    throw new Error("Restore must be staged and activated during a controlled restart");
  }
}
