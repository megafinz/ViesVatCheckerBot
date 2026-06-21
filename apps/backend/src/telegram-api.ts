import type { TelegramPollingApi } from './telegram-polling';
import type { TelegramMessenger, TelegramUpdate } from './telegram-updates';

type Fetch = (request: Request) => Promise<Response>;

export interface TelegramApiOptions {
  botToken: string;
  fetch?: Fetch;
}

type TelegramApiResponse<TResult> =
  | { ok: true; result: TResult }
  | { ok: false; description?: string };

export function createTelegramApi(
  options: TelegramApiOptions
): TelegramPollingApi & TelegramMessenger {
  const fetchImpl = options.fetch ?? fetch;

  return {
    async getUpdates(request) {
      return await telegramRequest<TelegramUpdate[]>(
        options.botToken,
        'getUpdates',
        {
          allowed_updates: ['message'],
          offset: request.offset,
          timeout: request.timeoutSeconds
        },
        fetchImpl
      );
    },

    async sendMessage(chatId, text) {
      await telegramRequest(
        options.botToken,
        'sendMessage',
        {
          chat_id: chatId,
          text
        },
        fetchImpl
      );
    }
  };
}

async function telegramRequest<TResult>(
  botToken: string,
  method: string,
  body: unknown,
  fetchImpl: Fetch
): Promise<TResult> {
  const response = await fetchImpl(
    new Request(`https://api.telegram.org/bot${botToken}/${method}`, {
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json'
      },
      method: 'POST'
    })
  );
  const payload = (await response.json()) as TelegramApiResponse<TResult>;

  if (!payload.ok) {
    throw new Error(
      `Telegram API request failed: ${payload.description ?? 'unknown error'}`
    );
  }

  return payload.result;
}
