import type {
  TelegramPollingApi,
  TelegramUpdate,
  TelegramWebhookApi
} from '@viesvatchecker/adapters';
import { pollTelegramOnce } from './telegram-polling';

export interface TelegramTransportConfig {
  pollingIntervalMs: number;
  transport: 'long-polling' | 'webhook';
  webhook: {
    path: string;
    secretToken?: string;
    url?: string;
  };
}

export interface TelegramTransportOptions {
  // The transport only needs to register a POST route, so the app's full
  // generic shape is irrelevant. We type it as the structural minimum
  // Elysia exposes (a constructor that returns an object with a .post()).
  app: {
    post(
      path: string,
      handler: (context: { request: Request }) => Promise<Response> | Response
    ): unknown;
  };
  config: TelegramTransportConfig;
  handleUpdate(update: TelegramUpdate): Promise<void>;
  telegram: TelegramPollingApi & TelegramWebhookApi;
}

export interface TelegramTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
}

const MAX_BACKOFF_MS = 60_000;

export function createTelegramTransport(
  options: TelegramTransportOptions
): TelegramTransport {
  switch (options.config.transport) {
    case 'long-polling':
      return createLongPollingTransport(options);
    case 'webhook':
      return createWebhookTransport(options);
  }
}

function createLongPollingTransport(
  options: TelegramTransportOptions
): TelegramTransport {
  let stopped = false;
  let timer: Timer | undefined;
  let consecutiveErrors = 0;
  let offset: number | undefined;

  const tick = async () => {
    if (stopped) {
      return;
    }

    try {
      if (consecutiveErrors === 0) {
        await options.telegram.deleteWebhook();
      }
      offset = await pollTelegramOnce(
        {
          api: options.telegram,
          handleUpdate: options.handleUpdate,
          maxUpdatesPerCycle: 50,
          timeoutSeconds: 30
        },
        offset
      );
      consecutiveErrors = 0;
    } catch (error) {
      consecutiveErrors += 1;
      const backoff = Math.min(
        MAX_BACKOFF_MS,
        options.config.pollingIntervalMs * 2 ** (consecutiveErrors - 1)
      );
      console.error(
        `Telegram polling failed (attempt ${consecutiveErrors}); retrying in ${backoff}ms`,
        error
      );
      if (!stopped) {
        timer = setTimeout(tick, backoff);
      }
      return;
    }

    if (!stopped) {
      timer = setTimeout(tick, options.config.pollingIntervalMs);
    }
  };

  return {
    async start() {
      timer = setTimeout(tick, 0);
    },
    async stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    }
  };
}

function createWebhookTransport(
  options: TelegramTransportOptions
): TelegramTransport {
  // The config layer validates that secretToken and url are set when
  // transport is 'webhook', so we can safely assert them here.
  const { secretToken, url } = options.config.webhook;
  if (!secretToken || !url) {
    throw new Error(
      'Webhook transport requires TG_WEBHOOK_SECRET and TG_WEBHOOK_URL to be set'
    );
  }

  options.app.post(
    options.config.webhook.path,
    async ({ request }: { request: Request }) => {
      const provided = request.headers.get('x-telegram-bot-api-secret-token');
      if (!provided || !timingSafeStringEquals(provided, secretToken)) {
        return new Response('Unauthorized', { status: 401 });
      }

      let update: TelegramUpdate;
      try {
        update = (await request.json()) as TelegramUpdate;
      } catch {
        return new Response('Invalid JSON', { status: 400 });
      }

      await options.handleUpdate(update);
      return new Response(null, { status: 200 });
    }
  );

  return {
    async start() {
      await options.telegram.setWebhook({ secretToken, url });
    },
    async stop() {
      await options.telegram.deleteWebhook();
    }
  };
}

function timingSafeStringEquals(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
