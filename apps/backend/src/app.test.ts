import { expect, test } from 'bun:test';
import { createBackendApp } from './app';

test('health endpoint reports the backend status and polling mode', async () => {
  const app = createBackendApp({
    admin: {
      internalApiToken: 'internal-token',
      repository: {
        getAllVatRequests: async () => [],
        getAllVatRequestErrors: async () => [],
        removeVatRequestError: async () => false,
        resolveVatRequestError: async () => ({ type: 'error-not-found' }),
        updateVatRequest: async () => false
      },
      telegram: { sendMessage: async () => {} }
    },
    pollingEnabled: true
  });

  const response = await app.handle(new Request('http://localhost/health'));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    ok: true,
    service: 'viesvatchecker-backend',
    telegramPolling: true
  });
});

test('internal admin routes are attached to the backend app', async () => {
  const app = createBackendApp({
    admin: {
      internalApiToken: 'internal-token',
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
    pollingEnabled: false
  });

  const response = await app.handle(
    new Request('http://localhost/internal/admin/vat-requests', {
      headers: { authorization: 'Bearer internal-token' }
    })
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
