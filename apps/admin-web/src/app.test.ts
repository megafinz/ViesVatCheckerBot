import { expect, test } from 'bun:test';
import { createAdminWebApp } from './app';

test('renders backend health as online when the backend responds successfully', async () => {
  const requests: Request[] = [];
  const app = createAdminWebApp({
    backendUrl: 'http://backend:8080',
    fetch: async (request) => {
      requests.push(request);
      return Response.json({
        ok: true,
        service: 'viesvatchecker-backend',
        telegramPolling: true
      });
    },
    internalApiToken: 'internal-token'
  });

  const response = await app.handle(new Request('http://localhost/'));
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(html).toContain('Backend online');
  expect(html).toContain('Telegram polling on');
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toBe('http://backend:8080/health');
  expect(requests[0].headers.get('authorization')).toBe(
    'Bearer internal-token'
  );
});

test('renders backend health as offline when the backend check fails', async () => {
  const app = createAdminWebApp({
    backendUrl: 'http://backend:8080',
    fetch: async () => new Response('unavailable', { status: 503 }),
    internalApiToken: 'internal-token'
  });

  const response = await app.handle(new Request('http://localhost/'));
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(html).toContain('Backend offline');
});

test('renders backend health as offline when the backend is unreachable', async () => {
  const app = createAdminWebApp({
    backendUrl: 'http://backend:8080',
    fetch: async () => {
      throw new Error('connection refused');
    },
    internalApiToken: 'internal-token'
  });

  const response = await app.handle(new Request('http://localhost/'));
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(html).toContain('Backend offline');
});
