import type { TelegramUpdate } from './telegram-updates';

export interface TelegramPollingApi {
  deleteWebhook(): Promise<void>;
  getUpdates(request: {
    offset?: number;
    timeoutSeconds: number;
  }): Promise<TelegramUpdate[]>;
}

export interface PollTelegramOnceDependencies {
  api: TelegramPollingApi;
  handleUpdate(update: TelegramUpdate): Promise<void>;
  timeoutSeconds: number;
  // Maximum number of updates to process in a single poll cycle. Additional
  // updates are deferred to the next cycle so a single slow handler can't
  // hold up unrelated updates indefinitely.
  maxUpdatesPerCycle?: number;
}

export async function pollTelegramOnce(
  deps: PollTelegramOnceDependencies,
  offset?: number
): Promise<number | undefined> {
  const updates = await deps.api.getUpdates({
    offset,
    timeoutSeconds: deps.timeoutSeconds
  });

  const limit = deps.maxUpdatesPerCycle ?? updates.length;
  const handledUpdates = updates.slice(0, limit);
  let nextOffset = offset;

  for (const update of handledUpdates) {
    await deps.handleUpdate(update);
    nextOffset = update.update_id + 1;
  }

  if (handledUpdates.length < updates.length) {
    const lastHandled = handledUpdates.at(-1);
    nextOffset = lastHandled ? lastHandled.update_id + 1 : offset;
  }

  return nextOffset;
}
