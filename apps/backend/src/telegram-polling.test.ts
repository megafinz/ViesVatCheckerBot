import { expect, test } from 'bun:test';
import { pollTelegramOnce } from './telegram-polling';
import type { TelegramUpdate } from './telegram-updates';

test('pollTelegramOnce fetches updates and advances offset after each handled update', async () => {
  const handledUpdates: TelegramUpdate[] = [];
  const getUpdatesCalls: Array<{ offset?: number; timeoutSeconds: number }> =
    [];

  const nextOffset = await pollTelegramOnce(
    {
      api: {
        getUpdates: async (request) => {
          getUpdatesCalls.push(request);
          return [
            { update_id: 100, message: { chat: { id: 1 }, text: '/list' } },
            { update_id: 101, message: { chat: { id: 1 }, text: '/list' } }
          ];
        }
      },
      handleUpdate: async (update) => {
        handledUpdates.push(update);
      },
      timeoutSeconds: 30
    },
    99
  );

  expect(getUpdatesCalls).toEqual([{ offset: 99, timeoutSeconds: 30 }]);
  expect(handledUpdates.map((update) => update.update_id)).toEqual([100, 101]);
  expect(nextOffset).toBe(102);
});
