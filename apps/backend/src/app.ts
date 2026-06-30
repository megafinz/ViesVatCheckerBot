import { Elysia } from 'elysia';
import {
  type AdminRepository,
  type AdminTelegram,
  createAdminRoutes
} from './admin-routes';

export interface BackendAppOptions {
  admin: {
    repository: AdminRepository;
    telegram: AdminTelegram;
  };
  pollingEnabled: boolean;
}

export function createBackendApp(options: BackendAppOptions) {
  return new Elysia()
    .use(createAdminRoutes(options.admin))
    .get('/health', () => ({
      ok: true,
      service: 'viesvatchecker-backend',
      telegramPolling: options.pollingEnabled
    }));
}
