import { Elysia } from 'elysia';

export interface BackendAppOptions {
  pollingEnabled: boolean;
}

export function createBackendApp(options: BackendAppOptions) {
  return new Elysia().get('/health', () => ({
    ok: true,
    service: 'viesvatchecker-backend',
    telegramPolling: options.pollingEnabled
  }));
}
