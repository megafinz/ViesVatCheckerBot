import { join } from 'node:path';
import { Elysia } from 'elysia';

interface AdminWebAppOptions {
  backendUrl: string;
  clientDistDir?: string;
  fetch(request: Request): Promise<Response>;
}

const developmentIndexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VIES VAT Checker Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/client/main.tsx"></script>
  </body>
</html>`;

export function createAdminWebApp(options: AdminWebAppOptions) {
  return new Elysia()
    .get('/', async () => {
      return new Response(await readIndexHtml(options), {
        headers: {
          'content-type': 'text/html; charset=utf-8'
        }
      });
    })
    .get('/assets/*', async ({ params }) => {
      const assetPath = params['*'];
      if (assetPath.includes('..')) {
        return new Response('Not found', { status: 404 });
      }

      const file = Bun.file(
        join(getClientDistDir(options), 'assets', assetPath)
      );
      if (!(await file.exists())) {
        return new Response('Not found', { status: 404 });
      }

      return new Response(file);
    })
    .get('/api/health', async () => {
      return await proxyBackendRequest(options, '/health');
    })
    .get('/api/vat-requests', async () => {
      return await proxyBackendRequest(options, '/internal/admin/vat-requests');
    })
    .patch('/api/vat-requests', async ({ request }) => {
      return await proxyBackendRequest(
        options,
        '/internal/admin/vat-requests',
        {
          body: await request.text(),
          headers: copyContentHeaders(request.headers),
          method: 'PATCH'
        }
      );
    })
    .get('/api/vat-request-errors', async () => {
      return await proxyBackendRequest(
        options,
        '/internal/admin/vat-request-errors'
      );
    })
    .post(
      '/api/vat-request-errors/:errorId/resolve',
      async ({ params, query }) => {
        const path = `/internal/admin/vat-request-errors/${encodeURIComponent(params.errorId)}/resolve`;
        const search = query.silent ? '?silent=true' : '';
        return await proxyBackendRequest(options, `${path}${search}`, {
          method: 'POST'
        });
      }
    )
    .delete('/api/vat-request-errors/:errorId', async ({ params }) => {
      return await proxyBackendRequest(
        options,
        `/internal/admin/vat-request-errors/${encodeURIComponent(params.errorId)}`,
        { method: 'DELETE' }
      );
    });
}

async function readIndexHtml(options: AdminWebAppOptions): Promise<string> {
  const file = Bun.file(join(getClientDistDir(options), 'index.html'));
  if (await file.exists()) {
    return await file.text();
  }

  return developmentIndexHtml;
}

async function proxyBackendRequest(
  options: AdminWebAppOptions,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const response = await options.fetch(
    new Request(new URL(path, options.backendUrl), init)
  );

  return new Response(response.body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText
  });
}

function copyContentHeaders(headers: Headers): Headers {
  const nextHeaders = new Headers();
  const contentType = headers.get('content-type');
  if (contentType) {
    nextHeaders.set('content-type', contentType);
  }

  return nextHeaders;
}

function getClientDistDir(options: AdminWebAppOptions): string {
  return options.clientDistDir ?? join(process.cwd(), 'client');
}
