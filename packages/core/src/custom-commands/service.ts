export type CustomCommandAction =
  | { type: "message"; content: string }
  | { type: "alias"; command: string; args?: string[] }
  | { type: "role.add"; roleId: string }
  | { type: "role.remove"; roleId: string };

export interface CustomCommandAccess {
  roleIds: string[];
  channelIds: string[];
  cooldownSeconds: number;
}

export interface CustomCommand {
  id: string;
  communityId: string;
  name: string;
  description?: string;
  group?: string;
  enabled: boolean;
  aliases: string[];
  access: CustomCommandAccess;
  actions: CustomCommandAction[];
  updatedAt: Date;
  updatedBy?: string;
}

export interface CustomCommandInvocation {
  command: CustomCommand;
  userId: string;
  channelId?: string;
  roleIds?: string[];
  now?: Date;
}

export interface CustomCommandStateStore {
  getRuntimeState<T>(key: string): T | undefined;
  setRuntimeState(key: string, value: unknown, now?: Date): void;
}

export class CustomCommandService {
  private readonly commands = new Map<string, CustomCommand>();
  private readonly lastRun = new Map<string, number>();

  constructor(private readonly store?: CustomCommandStateStore) {
    const stored = store?.getRuntimeState<Array<Omit<CustomCommand, "updatedAt"> & { updatedAt: string }>>("custom_commands") ?? [];
    for (const item of stored) this.commands.set(item.id, {
      ...item,
      updatedAt: new Date(item.updatedAt),
      aliases: [...item.aliases],
      actions: [...item.actions],
      access: { ...item.access, roleIds: [...item.access.roleIds], channelIds: [...item.access.channelIds] }
    });
  }

  private persist(): void {
    this.store?.setRuntimeState("custom_commands", [...this.commands.values()].map((item) => ({ ...item, updatedAt: item.updatedAt.toISOString() })));
  }

  upsert(command: CustomCommand): void {
    this.commands.set(command.id, {
      ...command,
      updatedAt: command.updatedAt instanceof Date ? command.updatedAt : new Date(command.updatedAt as unknown as string),
      aliases: [...command.aliases],
      actions: [...command.actions],
      access: {
        ...command.access,
        roleIds: [...command.access.roleIds],
        channelIds: [...command.access.channelIds]
      }
    });
    this.persist();
  }

  remove(commandId: string): void {
    this.commands.delete(commandId);
    this.persist();
  }

  get(communityId: string, name: string): CustomCommand | undefined {
    const normalized = name.toLowerCase();
    return [...this.commands.values()].find((command) =>
      command.communityId === communityId &&
      command.enabled &&
      (command.name.toLowerCase() === normalized ||
        command.aliases.some((alias) => alias.toLowerCase() === normalized))
    );
  }

  list(communityId: string): CustomCommand[] {
    return [...this.commands.values()]
      .filter((command) => command.communityId === communityId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  canExecute(input: CustomCommandInvocation): {
    allowed: boolean;
    reason?: string;
  } {
    const access = input.command.access;
    if (access.channelIds.length > 0 &&
      input.channelId &&
      !access.channelIds.includes(input.channelId)) {
      return { allowed: false, reason: "channel_not_allowed" };
    }

    if (access.roleIds.length > 0 &&
      !(input.roleIds ?? []).some((roleId) => access.roleIds.includes(roleId))) {
      return { allowed: false, reason: "role_not_allowed" };
    }

    const key = input.command.id + ":" + input.userId;
    const now = (input.now ?? new Date()).getTime();
    const last = this.lastRun.get(key) ?? 0;
    if (now - last < access.cooldownSeconds * 1000) {
      return {
        allowed: false,
        reason: "cooldown"
      };
    }

    this.lastRun.set(key, now);
    return { allowed: true };
  }
}
