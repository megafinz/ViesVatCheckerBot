import { expect, test } from 'bun:test';
import { createTelegramApi } from './telegram-api';

test('Telegram API getUpdates calls the bot API with offset and timeout', async () => {
  const requests: Request[] = [];
  const api = createTelegramApi({
    botToken: 'telegram-token',
    fetch: async (request) => {
      requests.push(request);
      return Response.json({
        ok: true,
        result: [
          { update_id: 123, message: { chat: { id: 1 }, text: '/list' } }
        ]
      });
    }
  });

  const updates = await api.getUpdates({ offset: 99, timeoutSeconds: 30 });

  expect(updates.map((update) => update.update_id)).toEqual([123]);
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toBe(
    'https://api.telegram.org/bottelegram-token/getUpdates'
  );
  expect(await requests[0].json()).toEqual({
    allowed_updates: ['message'],
    offset: 99,
    timeout: 30
  });
});

test('Telegram API sendMessage posts chat id and message text', async () => {
  const requests: Request[] = [];
  const api = createTelegramApi({
    botToken: 'telegram-token',
    fetch: async (request) => {
      requests.push(request);
      return Response.json({ ok: true, result: {} });
    }
  });

  await api.sendMessage('123', 'hello');

  expect(requests).toHaveLength(1);
  expect(requests[0].url).toBe(
    'https://api.telegram.org/bottelegram-token/sendMessage'
  );
  expect(await requests[0].json()).toEqual({
    chat_id: '123',
    text: 'hello'
  });
});

test('Telegram API deleteWebhook clears any registered webhook', async () => {
  const requests: Request[] = [];
  const api = createTelegramApi({
    botToken: 'telegram-token',
    fetch: async (request) => {
      requests.push(request);
      return Response.json({ ok: true, result: true });
    }
  });

  await api.deleteWebhook();

  expect(requests).toHaveLength(1);
  expect(requests[0].url).toBe(
    'https://api.telegram.org/bottelegram-token/deleteWebhook'
  );
  expect(await requests[0].json()).toEqual({});
});

test('Telegram API throws when Telegram returns ok false', async () => {
  const api = createTelegramApi({
    botToken: 'telegram-token',
    fetch: async () =>
      Response.json({
        ok: false,
        description: 'Unauthorized'
      })
  });

  await expect(api.getUpdates({ timeoutSeconds: 30 })).rejects.toThrow(
    'Telegram API request failed: Unauthorized'
  );
});
