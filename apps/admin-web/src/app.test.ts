import { expect, test } from 'bun:test';
import { createAdminWebApp } from './app';

test('serves the Vite React shell from the root route', async () => {
  const app = createAdminWebApp({
    backendUrl: 'http://backend:8080',
    fetch: async () => new Response('unexpected', { status: 500 })
  });

  const response = await app.handle(new Request('http://localhost/'));
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/html');
  expect(html).toContain('<div id="root"></div>');
  expect(html).toContain('/src/client/main.tsx');
});

test('proxies dashboard reads through server-side API routes', async () => {
  const backendRequests: Request[] = [];
  const app = createAdminWebApp({
    backendUrl: 'http://backend:8080',
    fetch: async (request) => {
      backendRequests.push(request);
      if (request.url === 'http://backend:8080/health') {
        return Response.json({
          ok: true,
          service: 'viesvatchecker-backend',
          telegramPolling: true
        });
      }
      if (request.url === 'http://backend:8080/internal/admin/vat-requests') {
        return Response.json([{ countryCode: 'PL', vatNumber: '123' }]);
      }
      if (
        request.url === 'http://backend:8080/internal/admin/vat-request-errors'
      ) {
        return Response.json([{ id: 'error-1' }]);
      }
      return new Response('not found', { status: 404 });
    }
  });

  await expectJson(
    await app.handle(new Request('http://localhost/api/health'))
  );
  await expectJson(
    await app.handle(new Request('http://localhost/api/vat-requests'))
  );
  await expectJson(
    await app.handle(new Request('http://localhost/api/vat-request-errors'))
  );

  expect(backendRequests.map((request) => request.url)).toEqual([
    'http://backend:8080/health',
    'http://backend:8080/internal/admin/vat-requests',
    'http://backend:8080/internal/admin/vat-request-errors'
  ]);
});

test('proxies pending VAT updates through a server-side API route', async () => {
  const backendRequests: Request[] = [];
  const app = createAdminWebApp({
    backendUrl: 'http://backend:8080',
    fetch: async (request) => {
      backendRequests.push(request);
      return new Response(null, { status: 204 });
    }
  });

  const response = await app.handle(
    new Request('http://localhost/api/vat-requests', {
      body: JSON.stringify({
        newVatNumber: 'PL1112223334',
        telegramChatId: '1001',
        vatNumber: 'PL1234567890'
      }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH'
    })
  );

  expect(response.status).toBe(204);
  expect(backendRequests).toHaveLength(1);
  expect(backendRequests[0].method).toBe('PATCH');
  expect(backendRequests[0].url).toBe(
    'http://backend:8080/internal/admin/vat-requests'
  );
  expect(await backendRequests[0].json()).toEqual({
    newVatNumber: 'PL1112223334',
    telegramChatId: '1001',
    vatNumber: 'PL1234567890'
  });
});

test('proxies VAT request error actions through server-side API routes', async () => {
  const backendRequests: Request[] = [];
  const app = createAdminWebApp({
    backendUrl: 'http://backend:8080',
    fetch: async (request) => {
      backendRequests.push(request);
      return new Response(null, { status: 204 });
    }
  });

  expect(
    await app.handle(
      new Request('http://localhost/api/vat-request-errors/error-1/resolve', {
        method: 'POST'
      })
    )
  ).toHaveProperty('status', 204);
  expect(
    await app.handle(
      new Request(
        'http://localhost/api/vat-request-errors/error-1/resolve?silent=true',
        { method: 'POST' }
      )
    )
  ).toHaveProperty('status', 204);
  expect(
    await app.handle(
      new Request('http://localhost/api/vat-request-errors/error-1', {
        method: 'DELETE'
      })
    )
  ).toHaveProperty('status', 204);

  expect(backendRequests.map((request) => request.method)).toEqual([
    'POST',
    'POST',
    'DELETE'
  ]);
  expect(backendRequests.map((request) => request.url)).toEqual([
    'http://backend:8080/internal/admin/vat-request-errors/error-1/resolve',
    'http://backend:8080/internal/admin/vat-request-errors/error-1/resolve?silent=true',
    'http://backend:8080/internal/admin/vat-request-errors/error-1'
  ]);
});

async function expectJson(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('application/json');
  await response.json();
}
