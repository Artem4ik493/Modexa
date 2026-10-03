import type { ModexaDatabase } from "../database/service.js";

export class CommandSettingsService {
  constructor(private readonly database?: ModexaDatabase) {}

  isEnabled(communityId: string, commandName: string): boolean {
    return this.database?.isCommandEnabled(communityId, commandName) ?? true;
  }

  setEnabled(communityId: string, commandName: string, enabled: boolean): void {
    this.database?.setCommandEnabled(communityId, commandName, enabled);
  }

  list(communityId: string): Array<{ commandName: string; enabled: boolean }> {
    return this.database?.getCommandSettings(communityId) ?? [];
  }
}
