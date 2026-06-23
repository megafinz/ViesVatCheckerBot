import { Elysia } from 'elysia';

interface BackendHealth {
  ok: boolean;
  service: string;
  telegramPolling: boolean;
}

interface AdminWebAppOptions {
  backendUrl: string;
  fetch(request: Request): Promise<Response>;
  internalApiToken: string;
}

export function createAdminWebApp(options: AdminWebAppOptions) {
  return new Elysia().get('/', async () => {
    const health = await getBackendHealth(options);
    return new Response(renderPage(health), {
      headers: {
        'content-type': 'text/html; charset=utf-8'
      }
    });
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

function renderPage(health: BackendHealth | undefined): string {
  const backendStatus = health?.ok ? 'Backend online' : 'Backend offline';
  const pollingStatus = health?.telegramPolling
    ? 'Telegram polling on'
    : 'Telegram polling off';

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
      </section>
    </main>
  </body>
</html>`;
}
