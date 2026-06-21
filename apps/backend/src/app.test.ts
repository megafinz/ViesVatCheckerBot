import { expect, test } from 'bun:test';
import { createBackendApp } from './app';

test('health endpoint reports the backend status and polling mode', async () => {
  const app = createBackendApp({ pollingEnabled: true });

  const response = await app.handle(new Request('http://localhost/health'));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    ok: true,
    service: 'viesvatchecker-backend',
    telegramPolling: true
  });
});
