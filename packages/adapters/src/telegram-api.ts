type Fetch = (request: Request) => Promise<Response>;

export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: {
      id: number | string;
    };
    text?: string;
  };
}

export interface TelegramPollingApi {
  deleteWebhook(): Promise<void>;
  getUpdates(request: {
    offset?: number;
    timeoutSeconds: number;
  }): Promise<TelegramUpdate[]>;
}

export interface TelegramWebhookApi {
  deleteWebhook(): Promise<void>;
  setWebhook(request: { secretToken?: string; url: string }): Promise<void>;
}

export interface TelegramMessenger {
  sendMessage(chatId: string, text: string): Promise<void>;
}

export interface TelegramApiOptions {
  botToken: string;
  fetch?: Fetch;
}

type TelegramApiResponse<TResult> =
  | { ok: true; result: TResult }
  | { ok: false; description?: string };

export function createTelegramApi(
  options: TelegramApiOptions
): TelegramPollingApi & TelegramWebhookApi & TelegramMessenger {
  const fetchImpl = options.fetch ?? fetch;

  return {
    async deleteWebhook() {
      await telegramRequest(options.botToken, 'deleteWebhook', {}, fetchImpl);
    },

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
    },

    async setWebhook(request) {
      await telegramRequest(
        options.botToken,
        'setWebhook',
        {
          secret_token: request.secretToken,
          url: request.url
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
