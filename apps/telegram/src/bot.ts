import {
  CommandParser,
  CommandRegistry,
  CommandService,
  CoreLogger,
  ExecutionContextService,
  IdentityLinkService,
  IdentityLinkingService,
  InteractionActionStore,
  InteractionDispatcher,
  createBuiltinCommands,
  createBridgeTestCommand,
  createMemberCommand,
  createMembersCommand,
  createAccountInteractionHandler,
  createCommunitySettingsInteractionHandler,
  createBridgeTestInteractionHandler,
  createIdentityLinkCommand,
  BridgeService,
  type PlatformIdentityResolver,
  type CommunityService,
  type MembershipService,
  IdentityService,
  AccessControlService,
  ModexaDatabase,
  type MemberDirectory
} from "@modexa/core";

import {
  Bot
} from "grammy";

import {
  TelegramAdapter
} from "./adapter.js";

import {
  createTelegramEventHandler
} from "./handler.js";

export interface CreateTelegramAdapterOptions {
  /**
   * Shared resolver that maps Telegram users and chats to
   * real Modexa entities.
   */
  identityResolver?:
    PlatformIdentityResolver;

  /**
   * Shared execution context service.
   * Runner passes the same instance to every adapter.
   */
  executionContextService?:
    ExecutionContextService;

  interactionStore?:
    InteractionActionStore;

  bridgeService?:
    BridgeService;

  communityService?:
    CommunityService;

  membershipService?:
    MembershipService;

  identityService?:
    IdentityService;

  identityLinkService?:
    IdentityLinkService;

  identityLinkingService?:
    IdentityLinkingService;

  accessControlService?:
    AccessControlService;

  database?:
    ModexaDatabase;
}

export function createTelegramAdapter(
  token: string,
  logger: CoreLogger,
  options:
    CreateTelegramAdapterOptions = {}
): TelegramAdapter {
  const bot =
    new Bot(token);

  const registry =
    new CommandRegistry();

  let memberDirectory:
    MemberDirectory | undefined;

  const memberDirectoryProxy: MemberDirectory = {
    getMember(
      communityExternalId,
      userExternalId
    ) {
      return (
        memberDirectory?.getMember(
          communityExternalId,
          userExternalId
        ) ?? Promise.resolve(undefined)
      );
    },

    listMembers(
      communityExternalId
    ) {
      return (
        memberDirectory?.listMembers(
          communityExternalId
        ) ?? Promise.resolve([])
      );
    }
  };

  const accessControlService =
    options.accessControlService ??
    new AccessControlService();

  createBuiltinCommands(
    registry,
    options.communityService,
    options.identityService,
    options.membershipService,
    accessControlService,
    options.database,
    options.bridgeService
  );

  if (
    options.identityService &&
    options.identityLinkService &&
    options.identityLinkingService
  ) {
    registry.register(
      createIdentityLinkCommand(
        options.identityService,
        options.identityLinkService,
        options.identityLinkingService
      )
    );
  }

  if (options.bridgeService) {
    registry.register(
      createBridgeTestCommand(
        options.bridgeService,
        options.identityService ??
          new IdentityService(),
        options.membershipService
      )
    );
  }

  if (
    options.identityService &&
    options.membershipService
  ) {
    registry.register(
      createMemberCommand(
        options.identityService,
        options.membershipService,
        accessControlService,
        memberDirectoryProxy
      )
    );

    registry.register(
      createMembersCommand(
        options.identityService,
        options.membershipService,
        accessControlService,
        memberDirectoryProxy
      )
    );
  }

  const commandService =
    new CommandService(
      new CommandParser(),
      registry,
      logger
    );

  const store =
    options.interactionStore ??
    new InteractionActionStore();

  const dispatcher =
    new InteractionDispatcher(
      store,
      commandService,
      logger
    );

  if (options.bridgeService) {
    dispatcher.registerCallback(
      "bridge.test.",
      createBridgeTestInteractionHandler(
        options.bridgeService,
        options.membershipService
      )
    );
  }

  dispatcher.registerCallback(
    "settings.bridge.",
    options.bridgeService
      ? createCommunitySettingsInteractionHandler(
          options.bridgeService
        )
      : () => ({
          content: "Bridge unavailable"
        })
  );

  dispatcher.registerCallback(
    "account.unlink:",
    options.identityService
      ? createAccountInteractionHandler(
          options.identityService
        )
      : () => ({
          content: "Account unavailable"
        })
  );

  dispatcher.registerCallback(
    "menu.close",
    () => ({ close: true })
  );

  const adapter =
    new TelegramAdapter(
      bot
    );

  memberDirectory = adapter;

  adapter.onEvent(
    createTelegramEventHandler({
      responder:
        adapter,
      logger,
      commandService,
      dispatcher,
      store,
      executionContextService:
        options.executionContextService ??
        new ExecutionContextService(),
      identityResolver:
        options.identityResolver,
      bridgeService:
        options.bridgeService,
      database:
        options.database
    })
  );

  return adapter;
}
