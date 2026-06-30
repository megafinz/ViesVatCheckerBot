import { expect, test } from 'bun:test';
import { startAdminWeb } from './index';

test('startAdminWeb starts the app on configured host and port', async () => {
  const started = await startAdminWeb(
    {
      ADMIN_BACKEND_URL: 'http://backend:8080',
      HOST: '127.0.0.1',
      PORT: '18081'
    },
    {
      listen: (_app, options) => {
        expect(options).toEqual({ hostname: '127.0.0.1', port: 18081 });
        return {
          stop: async () => {}
        };
      }
    }
  );

  await started.stop();
});
