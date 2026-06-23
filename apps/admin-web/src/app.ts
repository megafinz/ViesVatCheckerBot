import { Elysia } from 'elysia';

interface BackendHealth {
  ok: boolean;
  service: string;
  telegramPolling: boolean;
}

interface PendingVatRequest {
  countryCode: string;
  expirationDate: string;
  telegramChatId: string;
  vatNumber: string;
}

interface VatRequestError {
  error: string;
  id: string;
  vatRequest: PendingVatRequest;
}

interface AdminDashboard {
  errors?: VatRequestError[];
  pending?: PendingVatRequest[];
}

interface AdminWebAppOptions {
  backendUrl: string;
  fetch(request: Request): Promise<Response>;
  internalApiToken: string;
}

export function createAdminWebApp(options: AdminWebAppOptions) {
  return new Elysia()
    .get('/', async () => {
      const [health, dashboard] = await Promise.all([
        getBackendHealth(options),
        getAdminDashboard(options)
      ]);
      return new Response(renderPage(health, dashboard), {
        headers: {
          'content-type': 'text/html; charset=utf-8'
        }
      });
    })
    .post('/vat-requests/update', async ({ request }) => {
      const form = await request.formData();
      return await proxyAdminAction(
        options,
        new Request(
          new URL('/internal/admin/vat-requests', options.backendUrl),
          {
            body: JSON.stringify({
              newVatNumber: getFormValue(form, 'newVatNumber'),
              telegramChatId: getFormValue(form, 'telegramChatId'),
              vatNumber: getFormValue(form, 'vatNumber')
            }),
            headers: {
              'content-type': 'application/json'
            },
            method: 'PATCH'
          }
        )
      );
    })
    .post('/vat-request-errors/:errorId/resolve', async ({ params }) => {
      return await proxyAdminAction(
        options,
        new Request(
          new URL(
            `/internal/admin/vat-request-errors/${encodeURIComponent(params.errorId)}/resolve`,
            options.backendUrl
          ),
          { method: 'POST' }
        )
      );
    })
    .post('/vat-request-errors/:errorId/resolve-silent', async ({ params }) => {
      const url = new URL(
        `/internal/admin/vat-request-errors/${encodeURIComponent(params.errorId)}/resolve`,
        options.backendUrl
      );
      url.searchParams.set('silent', 'true');

      return await proxyAdminAction(
        options,
        new Request(url, { method: 'POST' })
      );
    })
    .post('/vat-request-errors/:errorId/delete', async ({ params }) => {
      return await proxyAdminAction(
        options,
        new Request(
          new URL(
            `/internal/admin/vat-request-errors/${encodeURIComponent(params.errorId)}`,
            options.backendUrl
          ),
          { method: 'DELETE' }
        )
      );
    });
}

async function getBackendHealth(
  options: AdminWebAppOptions
): Promise<BackendHealth | undefined> {
  let response: Response;
  try {
    const url = new URL('/health', options.backendUrl);
    response = await options.fetch(
      new Request(url, {
        headers: {
          authorization: `Bearer ${options.internalApiToken}`
        }
      })
    );
  } catch {
    return undefined;
  }

  if (!response.ok) {
    return undefined;
  }

  return await response.json();
}

async function getAdminDashboard(
  options: AdminWebAppOptions
): Promise<AdminDashboard> {
  const [pending, errors] = await Promise.all([
    getList<PendingVatRequest>('/internal/admin/vat-requests', options),
    getList<VatRequestError>('/internal/admin/vat-request-errors', options)
  ]);

  return { errors, pending };
}

async function getList<T>(
  path: string,
  options: AdminWebAppOptions
): Promise<T[] | undefined> {
  let response: Response;
  try {
    response = await options.fetch(
      new Request(new URL(path, options.backendUrl), {
        headers: {
          authorization: `Bearer ${options.internalApiToken}`
        }
      })
    );
  } catch {
    return undefined;
  }

  if (!response.ok) {
    return undefined;
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : undefined;
}

async function proxyAdminAction(
  options: AdminWebAppOptions,
  backendRequest: Request
): Promise<Response> {
  const headers = new Headers(backendRequest.headers);
  headers.set('authorization', `Bearer ${options.internalApiToken}`);

  const response = await options.fetch(
    new Request(backendRequest, {
      headers
    })
  );

  if (!response.ok) {
    return new Response(await response.text(), { status: response.status });
  }

  return new Response(null, {
    headers: {
      location: '/'
    },
    status: 303
  });
}

function getFormValue(form: FormData, field: string): string {
  const value = form.get(field);
  return typeof value === 'string' ? value : '';
}

function renderPage(
  health: BackendHealth | undefined,
  dashboard: AdminDashboard
): string {
  const summary = {
    errorCount: dashboard.errors?.length,
    pendingCount: dashboard.pending?.length
  };
  const backendStatus = health?.ok ? 'Backend online' : 'Backend offline';
  const pollingStatus = health?.telegramPolling
    ? 'Telegram polling on'
    : 'Telegram polling off';
  const pendingStatus =
    summary.pendingCount === undefined
      ? 'Pending unknown'
      : `${summary.pendingCount} pending`;
  const errorStatus =
    summary.errorCount === undefined
      ? 'Errors unknown'
      : `${summary.errorCount} error${summary.errorCount === 1 ? '' : 's'}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>VIES VAT Checker Admin</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #17202a;
        background: #f6f7f9;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
      }

      main {
        width: min(880px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 40px 0;
      }

      header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 24px;
        margin-bottom: 24px;
      }

      h1 {
        margin: 0;
        font-size: 24px;
        font-weight: 650;
        line-height: 1.2;
      }

      .status-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }

      .status-card {
        min-height: 112px;
        border: 1px solid #d8dee8;
        border-radius: 8px;
        background: #ffffff;
        padding: 18px;
      }

      .label {
        margin: 0 0 10px;
        color: #596579;
        font-size: 13px;
        font-weight: 600;
      }

      .value {
        margin: 0;
        font-size: 20px;
        font-weight: 650;
      }

      .online {
        color: #116b45;
      }

      .offline {
        color: #9c2f2f;
      }

      .section {
        margin-top: 28px;
      }

      h2 {
        margin: 0 0 12px;
        font-size: 18px;
        font-weight: 650;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid #d8dee8;
        background: #ffffff;
      }

      th,
      td {
        border-bottom: 1px solid #e5e9f0;
        padding: 12px;
        text-align: left;
        vertical-align: top;
      }

      th {
        color: #596579;
        font-size: 12px;
        font-weight: 650;
        text-transform: uppercase;
      }

      code {
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-size: 13px;
      }

      form {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      input {
        min-width: 150px;
        border: 1px solid #c7cfdb;
        border-radius: 6px;
        padding: 8px 10px;
        font: inherit;
      }

      button {
        border: 1px solid #263445;
        border-radius: 6px;
        background: #263445;
        color: #ffffff;
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        padding: 8px 10px;
      }

      .secondary {
        border-color: #c7cfdb;
        background: #ffffff;
        color: #263445;
      }

      .danger {
        border-color: #9c2f2f;
        background: #9c2f2f;
      }

      .empty {
        border: 1px solid #d8dee8;
        background: #ffffff;
        margin: 0;
        padding: 18px;
      }

      @media (max-width: 720px) {
        table,
        thead,
        tbody,
        tr,
        th,
        td {
          display: block;
        }

        thead {
          display: none;
        }

        tr {
          border-bottom: 1px solid #d8dee8;
        }

        td {
          border-bottom: 0;
        }

        form {
          align-items: stretch;
          flex-direction: column;
        }

        input,
        button {
          width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>VIES VAT Checker Admin</h1>
      </header>
      <section class="status-grid" aria-label="Service status">
        <article class="status-card">
          <p class="label">Backend</p>
          <p class="value ${health?.ok ? 'online' : 'offline'}">${backendStatus}</p>
        </article>
        <article class="status-card">
          <p class="label">Telegram</p>
          <p class="value">${pollingStatus}</p>
        </article>
        <article class="status-card">
          <p class="label">Pending VAT</p>
          <p class="value">${pendingStatus}</p>
        </article>
        <article class="status-card">
          <p class="label">Errors</p>
          <p class="value">${errorStatus}</p>
        </article>
      </section>
      <section class="section" aria-labelledby="pending-heading">
        <h2 id="pending-heading">Pending VAT requests</h2>
        ${renderPendingVatRequests(dashboard.pending)}
      </section>
      <section class="section" aria-labelledby="errors-heading">
        <h2 id="errors-heading">VAT request errors</h2>
        ${renderVatRequestErrors(dashboard.errors)}
      </section>
    </main>
  </body>
</html>`;
}

function renderPendingVatRequests(
  requests: PendingVatRequest[] | undefined
): string {
  if (requests === undefined) {
    return '<p class="empty">Pending VAT requests unavailable.</p>';
  }

  if (requests.length === 0) {
    return '<p class="empty">No pending VAT requests.</p>';
  }

  return `<table>
          <thead>
            <tr>
              <th>VAT number</th>
              <th>Telegram Chat ID</th>
              <th>Expires</th>
              <th>Update</th>
            </tr>
          </thead>
          <tbody>
            ${requests.map(renderPendingVatRequestRow).join('')}
          </tbody>
        </table>`;
}

function renderPendingVatRequestRow(request: PendingVatRequest): string {
  const vatNumber = formatVatNumber(request);
  return `<tr>
              <td><code>${escapeHtml(vatNumber)}</code></td>
              <td><code>${escapeHtml(request.telegramChatId)}</code></td>
              <td>${escapeHtml(formatDate(request.expirationDate))}</td>
              <td>
                <form method="post" action="/vat-requests/update">
                  <input type="hidden" name="telegramChatId" value="${escapeHtml(request.telegramChatId)}">
                  <input type="hidden" name="vatNumber" value="${escapeHtml(vatNumber)}">
                  <input name="newVatNumber" placeholder="New VAT number" aria-label="New VAT number for ${escapeHtml(vatNumber)}">
                  <button type="submit">Update</button>
                </form>
              </td>
            </tr>`;
}

function renderVatRequestErrors(errors: VatRequestError[] | undefined): string {
  if (errors === undefined) {
    return '<p class="empty">VAT request errors unavailable.</p>';
  }

  if (errors.length === 0) {
    return '<p class="empty">No VAT request errors.</p>';
  }

  return `<table>
          <thead>
            <tr>
              <th>VAT number</th>
              <th>Telegram Chat ID</th>
              <th>Error</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${errors.map(renderVatRequestErrorRow).join('')}
          </tbody>
        </table>`;
}

function renderVatRequestErrorRow(error: VatRequestError): string {
  const vatNumber = formatVatNumber(error.vatRequest);
  const errorId = encodeURIComponent(error.id);
  return `<tr>
              <td><code>${escapeHtml(vatNumber)}</code></td>
              <td><code>${escapeHtml(error.vatRequest.telegramChatId)}</code></td>
              <td>${escapeHtml(error.error)}</td>
              <td>
                <div class="actions">
                  <form method="post" action="/vat-request-errors/${escapeHtml(errorId)}/resolve">
                    <button type="submit">Resolve</button>
                  </form>
                  <form method="post" action="/vat-request-errors/${escapeHtml(errorId)}/resolve-silent">
                    <button class="secondary" type="submit">Resolve silently</button>
                  </form>
                  <form method="post" action="/vat-request-errors/${escapeHtml(errorId)}/delete">
                    <button class="danger" type="submit">Delete</button>
                  </form>
                </div>
              </td>
            </tr>`;
}

function formatVatNumber(
  request: Pick<PendingVatRequest, 'countryCode' | 'vatNumber'>
) {
  return `${request.countryCode}${request.vatNumber}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
