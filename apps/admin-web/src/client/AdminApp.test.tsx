import { expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { AdminAppView } from './AdminApp';

test('renders dashboard data in the React admin app', () => {
  const html = renderToString(
    <AdminAppView
      errors={[
        {
          error: 'VIES unavailable',
          id: 'error-1',
          vatRequest: {
            countryCode: 'PL',
            expirationDate: '2026-07-01T12:00:00.000Z',
            telegramChatId: '1001',
            vatNumber: '1234567890'
          }
        }
      ]}
      health={{
        ok: true,
        service: 'viesvatchecker-backend',
        telegramPolling: true
      }}
      pending={[
        {
          countryCode: 'DE',
          expirationDate: '2026-07-02T12:00:00.000Z',
          telegramChatId: '1002',
          vatNumber: '987654321'
        }
      ]}
    />
  );

  expect(html).toContain('Backend online');
  expect(html).toContain('Telegram polling on');
  expect(html).toContain('DE987654321');
  expect(html).toContain('PL1234567890');
  expect(html).toContain('VIES unavailable');
});
