import type { TelegramUpdate } from './telegram-updates';

export interface TelegramPollingApi {
  getUpdates(request: {
    offset?: number;
    timeoutSeconds: number;
  }): Promise<TelegramUpdate[]>;
}

export interface PollTelegramOnceDependencies {
  api: TelegramPollingApi;
  handleUpdate(update: TelegramUpdate): Promise<void>;
  timeoutSeconds: number;
}

export async function pollTelegramOnce(
  deps: PollTelegramOnceDependencies,
  offset?: number
): Promise<number | undefined> {
  let nextOffset = offset;
  const updates = await deps.api.getUpdates({
    offset,
    timeoutSeconds: deps.timeoutSeconds
  });

  for (const update of updates) {
    await deps.handleUpdate(update);
    nextOffset = update.update_id + 1;
  }

  return nextOffset;
}
