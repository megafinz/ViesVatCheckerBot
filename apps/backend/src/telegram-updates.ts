import {
  checkVatRequest,
  listVatRequests,
  uncheckAllVatRequests,
  uncheckVatRequest,
  type VatCommandConfig,
  type VatRequest,
  type VatRequestRepository,
  type ViesClient
} from '@viesvatchecker/core';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: {
      id: number | string;
    };
    text?: string;
  };
}

export interface TelegramMessenger {
  sendMessage(chatId: string, text: string): Promise<void>;
}

export interface HandleTelegramUpdateDependencies {
  config: VatCommandConfig;
  repository: VatRequestRepository;
  telegram: TelegramMessenger;
  vies: ViesClient;
}

export async function handleTelegramUpdate(
  update: TelegramUpdate,
  deps: HandleTelegramUpdateDependencies
): Promise<void> {
  const text = update.message?.text;
  const chatId = update.message?.chat.id;

  if (text === undefined || chatId === undefined) {
    return;
  }

  const telegramChatId = String(chatId);
  const responseMessage = await handleCommand(text, telegramChatId, deps);

  if (responseMessage) {
    await deps.telegram.sendMessage(telegramChatId, responseMessage);
  }
}

async function handleCommand(
  text: string,
  telegramChatId: string,
  deps: HandleTelegramUpdateDependencies
): Promise<string | null> {
  const [commandWithBotName, ...args] = text.trim().split(/\s+/);
  const command = commandWithBotName?.split('@')[0];

  if (command === '/check') {
    if (args.length !== 1) {
      return 'Please provide a single VAT number prefixed by country code: /check VAT_NUMBER (example: /check PL1234567890).';
    }

    const response = await checkVatRequest(
      parseVatRequest(telegramChatId, args[0]),
      {
        config: deps.config,
        repository: deps.repository,
        vies: deps.vies
      }
    );
    return response.body.message;
  }

  if (command === '/uncheck') {
    if (args.length !== 1) {
      return 'Please provide a single VAT number prefixed by country code: /uncheck VAT_NUMBER(example: /uncheck PL1234567890).';
    }

    const response = await uncheckVatRequest(
      parseVatRequest(telegramChatId, args[0]),
      { repository: deps.repository }
    );
    return response.body.message;
  }

  if (command === '/list') {
    const response = await listVatRequests(telegramChatId, {
      repository: deps.repository
    });
    return response.body.message;
  }

  if (command === '/uncheckall') {
    const response = await uncheckAllVatRequests(telegramChatId, {
      repository: deps.repository
    });
    return response.body.message;
  }

  return null;
}

function parseVatRequest(
  telegramChatId: string,
  vatNumber: string
): VatRequest {
  return {
    telegramChatId,
    countryCode: vatNumber.slice(0, 2).toUpperCase(),
    vatNumber: vatNumber.slice(2)
  };
}
