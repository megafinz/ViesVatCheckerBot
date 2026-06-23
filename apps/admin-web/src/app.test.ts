import { expect, test } from 'bun:test';
import { createAdminWebApp } from './app';

const pendingVatRequests = [
  {
    countryCode: 'PL',
    expirationDate: '2026-07-01T12:00:00.000Z',
    telegramChatId: '1001',
    vatNumber: '1234567890'
  },
  {
    countryCode: 'DE',
    expirationDate: '2026-07-02T12:00:00.000Z',
    telegramChatId: '1002',
    vatNumber: '987654321'
  }
];

const vatRequestErrors = [
  {
    error: 'VIES unavailable',
    id: 'error-1',
    vatRequest: pendingVatRequests[0]
  }
];

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
        return Response.json(pendingVatRequests);
      }
      if (
        request.url === 'http://backend:8080/internal/admin/vat-request-errors'
      ) {
        return Response.json(vatRequestErrors);
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

test('renders pending VAT requests and VAT request errors with admin actions', async () => {
  const app = createAdminWebApp({
    backendUrl: 'http://backend:8080',
    fetch: async (request) => {
      if (request.url === 'http://backend:8080/health') {
        return Response.json({
          ok: true,
          service: 'viesvatchecker-backend',
          telegramPolling: true
        });
      }
      if (request.url === 'http://backend:8080/internal/admin/vat-requests') {
        return Response.json(pendingVatRequests);
      }
      if (
        request.url === 'http://backend:8080/internal/admin/vat-request-errors'
      ) {
        return Response.json(vatRequestErrors);
      }
      return new Response('not found', { status: 404 });
    },
    internalApiToken: 'internal-token'
  });

  const response = await app.handle(new Request('http://localhost/'));
  const html = await response.text();

  expect(html).toContain('PL1234567890');
  expect(html).toContain('DE987654321');
  expect(html).toContain('1001');
  expect(html).toContain('2026-07-01 12:00 UTC');
  expect(html).toContain('VIES unavailable');
  expect(html).toContain('action="/vat-requests/update"');
  expect(html).toContain('name="telegramChatId" value="1001"');
  expect(html).toContain('name="vatNumber" value="PL1234567890"');
  expect(html).toContain('name="newVatNumber"');
  expect(html).toContain('action="/vat-request-errors/error-1/resolve"');
  expect(html).toContain('action="/vat-request-errors/error-1/resolve-silent"');
  expect(html).toContain('action="/vat-request-errors/error-1/delete"');
});

test('updates a pending VAT request through the protected backend API', async () => {
  const backendRequests: Request[] = [];
  const app = createAdminWebApp({
    backendUrl: 'http://backend:8080',
    fetch: async (request) => {
      backendRequests.push(request);
      return new Response(null, { status: 204 });
    },
    internalApiToken: 'internal-token'
  });

  const response = await app.handle(
    new Request('http://localhost/vat-requests/update', {
      body: new URLSearchParams({
        newVatNumber: 'PL1112223334',
        telegramChatId: '1001',
        vatNumber: 'PL1234567890'
      }),
      method: 'POST'
    })
  );

  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/');
  expect(backendRequests).toHaveLength(1);
  expect(backendRequests[0].method).toBe('PATCH');
  expect(backendRequests[0].url).toBe(
    'http://backend:8080/internal/admin/vat-requests'
  );
  expect(backendRequests[0].headers.get('authorization')).toBe(
    'Bearer internal-token'
  );
  expect(await backendRequests[0].json()).toEqual({
    newVatNumber: 'PL1112223334',
    telegramChatId: '1001',
    vatNumber: 'PL1234567890'
  });
});

test('resolves a VAT request error through the protected backend API', async () => {
  const backendRequests: Request[] = [];
  const app = createAdminWebApp({
    backendUrl: 'http://backend:8080',
    fetch: async (request) => {
      backendRequests.push(request);
      return new Response(null, { status: 204 });
    },
    internalApiToken: 'internal-token'
  });

  const response = await app.handle(
    new Request('http://localhost/vat-request-errors/error-1/resolve', {
      method: 'POST'
    })
  );

  expect(response.status).toBe(303);
  expect(backendRequests).toHaveLength(1);
  expect(backendRequests[0].method).toBe('POST');
  expect(backendRequests[0].url).toBe(
    'http://backend:8080/internal/admin/vat-request-errors/error-1/resolve'
  );
  expect(backendRequests[0].headers.get('authorization')).toBe(
    'Bearer internal-token'
  );
});

test('silently resolves a VAT request error through the protected backend API', async () => {
  const backendRequests: Request[] = [];
  const app = createAdminWebApp({
    backendUrl: 'http://backend:8080',
    fetch: async (request) => {
      backendRequests.push(request);
      return new Response(null, { status: 204 });
    },
    internalApiToken: 'internal-token'
  });

  const response = await app.handle(
    new Request('http://localhost/vat-request-errors/error-1/resolve-silent', {
      method: 'POST'
    })
  );

  expect(response.status).toBe(303);
  expect(backendRequests).toHaveLength(1);
  expect(backendRequests[0].method).toBe('POST');
  expect(backendRequests[0].url).toBe(
    'http://backend:8080/internal/admin/vat-request-errors/error-1/resolve?silent=true'
  );
});

test('deletes a VAT request error through the protected backend API', async () => {
  const backendRequests: Request[] = [];
  const app = createAdminWebApp({
    backendUrl: 'http://backend:8080',
    fetch: async (request) => {
      backendRequests.push(request);
      return new Response(null, { status: 204 });
    },
    internalApiToken: 'internal-token'
  });

  const response = await app.handle(
    new Request('http://localhost/vat-request-errors/error-1/delete', {
      method: 'POST'
    })
  );

  expect(response.status).toBe(303);
  expect(backendRequests).toHaveLength(1);
  expect(backendRequests[0].method).toBe('DELETE');
  expect(backendRequests[0].url).toBe(
    'http://backend:8080/internal/admin/vat-request-errors/error-1'
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
