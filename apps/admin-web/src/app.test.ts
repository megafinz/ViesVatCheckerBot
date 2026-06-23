import { expect, test } from 'bun:test';
import { createAdminWebApp } from './app';

test('renders backend health as online when the backend responds successfully', async () => {
  const requests: Request[] = [];
  const app = createAdminWebApp({
    backendUrl: 'http://backend:8080',
    fetch: async (request) => {
      requests.push(request);
      if (request.url === 'http://backend:8080/health') {
        return Response.json({
          ok: true,
          service: 'viesvatchecker-backend',
          telegramPolling: true
        });
      }
      if (request.url === 'http://backend:8080/internal/admin/vat-requests') {
        return Response.json([{ id: 'request-1' }, { id: 'request-2' }]);
      }
      if (
        request.url === 'http://backend:8080/internal/admin/vat-request-errors'
      ) {
        return Response.json([{ id: 'error-1' }]);
      }
      return new Response('not found', { status: 404 });
    },
    internalApiToken: 'internal-token'
  });

  const response = await app.handle(new Request('http://localhost/'));
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(html).toContain('Backend online');
  expect(html).toContain('Telegram polling on');
  expect(html).toContain('2 pending');
  expect(html).toContain('1 error');
  expect(requests).toHaveLength(3);
  expect(requests[0].url).toBe('http://backend:8080/health');
  expect(requests[1].url).toBe(
    'http://backend:8080/internal/admin/vat-requests'
  );
  expect(requests[2].url).toBe(
    'http://backend:8080/internal/admin/vat-request-errors'
  );
  expect(
    requests.map((request) => request.headers.get('authorization'))
  ).toEqual([
    'Bearer internal-token',
    'Bearer internal-token',
    'Bearer internal-token'
  ]);
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
