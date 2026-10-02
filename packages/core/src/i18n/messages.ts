import type { Locale } from "./locale.js";

export const ruMessages = {
  "interaction.not_found":
    "Это действие больше недоступно.",
  "interaction.expired":
    "Срок действия истёк. Вызовите команду снова.",
  "interaction.forbidden":
    "Это действие принадлежит другому пользователю.",
  "interaction.unhandled":
    "Это действие не поддерживается.",
  "interaction.failed":
    "Что-то пошло не так. Попробуйте ещё раз.",

  "command.ping.description":
    "Проверить, что Modexa работает",
  "command.forbidden":
    "У вас недостаточно прав для использования команд в этом сообществе.",
  "command.not_found":
    "Команда не найдена. Для просмотра доступных команд для вашей роли {role} используйте /help.",
  "command.ping.pong":
    "Понг!",

  "command.menu.description":
    "Показать главное меню",
  "menu.title":
    "Выберите действие:",
  "menu.account":
    "Аккаунт",
  "menu.settings":
    "Настройки",
  "menu.back":
    "Назад",

  "command.account.description":
    "Показать ваш аккаунт Modexa",
  "account.dm_only":
    "Управление аккаунтом доступно только в личном чате с ботом.",
  "account.title":
    "Аккаунт",
  "account.name":
    "Имя: {name}",
  "account.id":
    "ID: {id}",
  "account.context":
    "Контекст: {context}",
  "account.link":
    "🔗 Связать Telegram и Discord",

  "command.link.description":
    "Связать аккаунты Telegram и Discord",
  "identity.link.dm_only":
    "Связка аккаунтов доступна только в личном чате с ботом.",
  "identity.link.created":
    "Код для связки создан.",
  "identity.link.code":
    "Код: {code}",
  "identity.link.target":
    "Введите этот код в личном чате с ботом в {platform}.",
  "identity.link.expires":
    "Код действует 10 минут и может быть использован только один раз.",
  "identity.link.completed":
    "Аккаунт {platform} успешно связан с вашим аккаунтом Modexa.",
  "identity.link.already_linked":
    "Аккаунт {platform} уже связан с вашим аккаунтом Modexa.",
  "identity.link.invalid_code":
    "Код недействителен, истёк или уже использован.",
  "identity.link.wrong_platform":
    "Этот код нужно вводить в личном чате с ботом в {platform}.",
  "identity.link.identity_in_use":
    "Этот аккаунт уже связан с другим аккаунтом Modexa.",
  "identity.link.identity_unavailable":
    "Текущий аккаунт ещё не зарегистрирован в Modexa. Попробуйте снова.",
  "identity.link.same_account":
    "Нельзя связать аккаунт с самим собой.",

  "context.dm":
    "личный чат",
  "context.community":
    "сообщество",

  "command.bridge_test.description":
    "Тестово связать чат Telegram и Discord",
  "bridge.test.title":
    "Выбор чатов для привязки:",
  "bridge.test.scope.any":
    "Любые доступные",
  "bridge.test.scope.account":
    "Доступные моему аккаунту",
  "bridge.test.communities.title":
    "Выберите группу или сервер:",
  "bridge.test.channels.title":
    "Выберите чат для привязки:",
  "bridge.test.no_accounts":
    "У вас нет связанных аккаунтов Telegram и Discord, свяжите их через /link в личном чате с ботом.",
  "bridge.test.no_chats":
    "У вас нет доступных чатов.",
  "bridge.test.private_source.telegram":
    "Эта группа в Telegram приватная, просмотр чата и установка связи недоступны.",
  "bridge.test.private_source.discord":
    "Этот сервер в Discord приватный, просмотр чатов и установка связи недоступны.",
  "bridge.test.no_communities.telegram":
    "Нет доступных групп Telegram.",
  "bridge.test.no_communities.discord":
    "Нет доступных серверов Discord.",
  "bridge.test.private_target.telegram":
    "Группа приватная, невозможно установить связь.",
  "bridge.test.private_target.discord":
    "Сервер приватный, невозможно установить связь.",
  "bridge.test.source":
    "Источник: {platform} — {community} / {channel}",
  "bridge.test.page":
    "Страница: {page}/{total}",
  "bridge.test.community_only":
    "Эту команду можно использовать только в чате сообщества.",
  "bridge.test.forbidden":
    "Для создания Bridge-связки нужны права управления сообществом.",
  "bridge.test.source_unknown":
    "Текущий чат ещё не зарегистрирован в Modexa. Отправьте сообщение боту и повторите команду.",
  "bridge.test.no_targets":
    "Нет доступных чатов другой платформы для связи.",
  "bridge.test.previous":
    "← Назад",
  "bridge.test.next":
    "Далее →",
  "bridge.test.back":
    "← Назад",
  "bridge.test.close":
    "Закрыть",
  "bridge.test.page_unavailable":
    "Страница больше недоступна.",
  "bridge.test.endpoint_unavailable":
    "Чат для привязки больше недоступен.",
  "bridge.test.request_sent":
    "Запрос отправлен в {target}. Ожидаем подтверждение.",
  "bridge.test.confirmation":
    "Запрос на привязку\n\nИсточник: {source}\n\nПодтвердите создание связи с этим чатом.",
  "bridge.test.confirm":
    "Подтвердить",
  "bridge.test.reject":
    "Отклонить",
  "bridge.test.success":
    "Bridge подключён!\n\n{source}\n{target}\n\nСвязка работает.",
  "bridge.test.confirmed":
    "Связка подтверждена. Bridge работает.",
  "bridge.test.rejected":
    "Запрос на привязку отклонён.",
  "bridge.test.unknown_action":
    "Неизвестное действие Bridge.",

  "command.settings.description":
    "Показать настройки",
  "settings.community_unavailable":
    "Настройки сообщества пока недоступны.",
  "settings.forbidden":
    "Для изменения настроек нужны права управления сообществом.",
  "settings.community":
    "Настройки сообщества",
  "settings.mode.public":
    "Режим: публичный",
  "settings.mode.private":
    "Режим: приватный",
  "settings.mode.public_button":
    "🌐 Публичный",
  "settings.mode.private_button":
    "🔒 Приватный",
  "settings.dm":
    "Настройки\nПока нечего настраивать.",

  "command.help.description":
    "Показать список команд",
  "help.title":
    "Доступные команды:",
  "help.empty":
    "Нет доступных команд.",
  "help.no_description":
    "Без описания"
} as const;

export type MessageKey =
  keyof typeof ruMessages;

export type MessageCatalog =
  Record<MessageKey, string>;

export const enMessages: MessageCatalog = {
  "interaction.not_found":
    "This action is no longer available.",
  "interaction.expired":
    "This action has expired. Please run the command again.",
  "interaction.forbidden":
    "This action belongs to another user.",
  "interaction.unhandled":
    "This action is not supported.",
  "interaction.failed":
    "Something went wrong. Please try again.",

  "command.ping.description":
    "Check if Modexa is alive",
  "command.forbidden":
    "You do not have permission to use commands in this community.",
  "command.not_found":
    "Command not found. To view commands available for your role {role}, use /help.",
  "command.ping.pong":
    "Pong!",

  "command.menu.description":
    "Show the main menu",
  "menu.title":
    "Choose an action:",
  "menu.account":
    "Account",
  "menu.settings":
    "Settings",
  "menu.back":
    "Back",

  "command.account.description":
    "Show your Modexa account",
  "account.dm_only":
    "Account management is only available in a private chat with the bot.",
  "account.title":
    "Account",
  "account.name":
    "Name: {name}",
  "account.id":
    "ID: {id}",
  "account.context":
    "Context: {context}",
  "account.link":
    "🔗 Link Telegram and Discord",

  "command.link.description":
    "Link Telegram and Discord accounts",
  "identity.link.dm_only":
    "Account linking is only available in a private chat with the bot.",
  "identity.link.created":
    "A linking code has been created.",
  "identity.link.code":
    "Code: {code}",
  "identity.link.target":
    "Enter this code in a private chat with the bot on {platform}.",
  "identity.link.expires":
    "The code is valid for 10 minutes and can only be used once.",
  "identity.link.completed":
    "Your {platform} account has been linked to your Modexa account.",
  "identity.link.already_linked":
    "Your {platform} account is already linked to your Modexa account.",
  "identity.link.invalid_code":
    "The code is invalid, expired, or already used.",
  "identity.link.wrong_platform":
    "Enter this code in a private chat with the bot on {platform}.",
  "identity.link.identity_in_use":
    "This account is already linked to another Modexa account.",
  "identity.link.identity_unavailable":
    "Your current account is not registered in Modexa yet. Try again.",
  "identity.link.same_account":
    "An account cannot be linked to itself.",

  "context.dm":
    "private chat",
  "context.community":
    "community",

  "command.bridge_test.description":
    "Test-link a Telegram and Discord chat",
  "bridge.test.title":
    "Choose chats to link:",
  "bridge.test.scope.any":
    "Any available",
  "bridge.test.scope.account":
    "Available to my account",
  "bridge.test.communities.title":
    "Choose a group or server:",
  "bridge.test.channels.title":
    "Choose a chat to link:",
  "bridge.test.no_accounts":
    "You do not have linked Telegram and Discord accounts. Use /link in a private chat with the bot.",
  "bridge.test.no_chats":
    "You have no available chats.",
  "bridge.test.private_source.telegram":
    "This Telegram group is private. Chat viewing and linking are unavailable.",
  "bridge.test.private_source.discord":
    "This Discord server is private. Channel viewing and linking are unavailable.",
  "bridge.test.no_communities.telegram":
    "No Telegram groups are available.",
  "bridge.test.no_communities.discord":
    "No Discord servers are available.",
  "bridge.test.private_target.telegram":
    "The group is private. A bridge cannot be created.",
  "bridge.test.private_target.discord":
    "The server is private. A bridge cannot be created.",
  "bridge.test.source":
    "Source: {platform} — {community} / {channel}",
  "bridge.test.page":
    "Page: {page}/{total}",
  "bridge.test.community_only":
    "This command can only be used in a community chat.",
  "bridge.test.forbidden":
    "Community management permission is required to create a Bridge link.",
  "bridge.test.source_unknown":
    "This chat has not been registered in Modexa yet. Send a message to the bot and try again.",
  "bridge.test.no_targets":
    "There are no available chats on the other platform to link.",
  "bridge.test.previous":
    "← Back",
  "bridge.test.next":
    "Next →",
  "bridge.test.back":
    "← Back",
  "bridge.test.close":
    "Close",
  "bridge.test.page_unavailable":
    "This page is no longer available.",
  "bridge.test.endpoint_unavailable":
    "The selected chat is no longer available.",
  "bridge.test.request_sent":
    "Request sent to {target}. Waiting for confirmation.",
  "bridge.test.confirmation":
    "Link request\n\nSource: {source}\n\nConfirm creating a bridge with this chat.",
  "bridge.test.confirm":
    "Confirm",
  "bridge.test.reject":
    "Reject",
  "bridge.test.success":
    "Bridge connected!\n\n{source}\n{target}\n\nThe link is working.",
  "bridge.test.confirmed":
    "Link confirmed. Bridge is working.",
  "bridge.test.rejected":
    "Link request rejected.",
  "bridge.test.unknown_action":
    "Unknown Bridge action.",

  "command.settings.description":
    "Show settings",
  "settings.community_unavailable":
    "Community settings are not available yet.",
  "settings.forbidden":
    "Community management permission is required to change settings.",
  "settings.community":
    "Community settings",
  "settings.mode.public":
    "Mode: public",
  "settings.mode.private":
    "Mode: private",
  "settings.mode.public_button":
    "🌐 Public",
  "settings.mode.private_button":
    "🔒 Private",
  "settings.dm":
    "Settings\nNothing to configure yet.",

  "command.help.description":
    "Show available commands",
  "help.title":
    "Available commands:",
  "help.empty":
    "No commands available.",
  "help.no_description":
    "No description"
};

export const catalogs: Record<
  Locale,
  MessageCatalog
> = {
  ru: ruMessages,
  en: enMessages
};
