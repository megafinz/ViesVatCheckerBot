import { expect, test } from 'bun:test';
import { createBackendApp } from './app';

test('health endpoint reports the backend status and transport', async () => {
  const app = createBackendApp({
    admin: {
      repository: {
        getAllVatRequests: async () => [],
        getAllVatRequestErrors: async () => [],
        removeVatRequestError: async () => false,
        resolveVatRequestError: async () => ({ type: 'error-not-found' }),
        updateVatRequest: async () => false
      },
      telegram: { sendMessage: async () => {} }
    },
    transport: 'long-polling'
  });

  const response = await app.handle(new Request('http://localhost/health'));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    ok: true,
    service: 'viesvatchecker-backend',
    telegramTransport: 'long-polling'
  });
});

test('internal admin routes are attached to the backend app', async () => {
  const app = createBackendApp({
    admin: {
      repository: {
        getAllVatRequests: async () => [
          {
            telegramChatId: '123',
            countryCode: 'AA',
            vatNumber: '12345678',
            expirationDate: new Date('2026-09-19T00:00:00.000Z')
          }
        ],
        getAllVatRequestErrors: async () => [],
        removeVatRequestError: async () => false,
        resolveVatRequestError: async () => ({ type: 'error-not-found' }),
        updateVatRequest: async () => false
      },
      telegram: { sendMessage: async () => {} }
    },
    transport: 'webhook'
  });

  const response = await app.handle(
    new Request('http://localhost/internal/admin/vat-requests')
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([
    {
      telegramChatId: '123',
      countryCode: 'AA',
      vatNumber: '12345678',
      expirationDate: '2026-09-19T00:00:00.000Z'
    }
  ]);
});
