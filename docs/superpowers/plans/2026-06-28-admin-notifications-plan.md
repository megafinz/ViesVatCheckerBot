# Admin Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor admin notifications so they are optional, structured in core, and can fan out to multiple channels: logger, Telegram, and ntfy.

**Architecture:** Core emits typed admin notification events and does not know how those events are formatted or delivered. Adapter code owns channel formatting and delivery, while the pending VAT worker wires configured notifiers into the core job. Admin notifier failures must not prevent the worker from demoting a bad request or notifying the user.

**Tech Stack:** Bun, TypeScript, Elysia app packages, zod config parsing, existing Telegram adapter, ntfy HTTP API through `fetch`, Biome, Bun tests.

---

## Current Behavior Snapshot

The pending VAT worker currently sends admin notifications only through Telegram. The behavior lives inside `packages/core/src/pending-vat-job.ts`:

```ts
export interface PendingVatJobConfig {
  notifyAdminOnUnrecoverableErrors: boolean;
  adminTelegramChatId?: string;
}
```

When VIES throws an unrecoverable error, core demotes the pending request, sends a user-facing Telegram message, and optionally sends an admin Telegram message to `adminTelegramChatId`.

The new design keeps the same user-facing behavior and demotion behavior, but moves admin delivery out of core.

## Target Public Configuration

Use explicit channel selection. Default is no admin notifications.

```env
# Comma-separated: logger,telegram,ntfy. Empty means disabled.
ADMIN_NOTIFICATION_CHANNELS=

# Telegram admin notifications.
ADMIN_TELEGRAM_CHAT_IDS=

# ntfy admin notifications.
ADMIN_NTFY_URL=
ADMIN_NTFY_TOPIC=
ADMIN_NTFY_TOKEN=
ADMIN_NTFY_TOKEN_FILE=
```

Legacy env support should remain for one migration cycle:

```env
NOTIFY_ADMIN_ON_UNRECOVERABLE_ERRORS=true
TG_ADMIN_CHAT_ID=123
```

If `ADMIN_NOTIFICATION_CHANNELS` is empty and the legacy pair is set, parse it as a Telegram admin notification channel. Do not document the legacy pair as the preferred path in `SELF_HOSTING.md`.

## Files

- Modify: `packages/core/src/pending-vat-job.ts`
  - Add structured admin notification types.
  - Replace admin Telegram config with optional `adminNotifier`.
  - Ensure admin notifier failures do not fail the job.
- Modify: `packages/core/src/index.ts`
  - Export any new admin notification types.
- Modify: `packages/core/src/pending-vat-job.test.ts`
  - Cover structured admin events, disabled admin notifications, and failing admin notifier behavior.
- Modify: `packages/config/src/index.ts`
  - Parse new admin notification env vars.
  - Preserve legacy env compatibility.
  - Add `ADMIN_NTFY_TOKEN_FILE` secret fallback.
- Modify: `packages/config/src/index.test.ts`
  - Cover defaults, logger, Telegram multi-chat parsing, ntfy config, token file fallback, validation, and legacy compatibility.
- Create: `packages/adapters/src/admin-notifications.ts`
  - Format structured events into text.
  - Implement logger, Telegram, ntfy, and fan-out notifiers.
- Create: `packages/adapters/src/admin-notifications.test.ts`
  - Test formatting and delivery behavior.
- Modify: `packages/adapters/src/index.ts`
  - Export admin notification adapters.
- Modify: `apps/pending-vat-worker/src/index.ts`
  - Build admin notifier from parsed config and pass it into core.
- Modify: `apps/pending-vat-worker/src/index.test.ts`
  - Cover worker wiring for admin notifier config.
- Modify: `.env.example`
  - Add new admin notification env vars.
  - Keep legacy vars only if still required by compatibility tests.
- Modify: `docker-compose.yml`
  - Add optional admin notification env vars for `pending-vat-worker`.
- Modify: `SELF_HOSTING.md`
  - Document optional logger, Telegram, and ntfy admin notification channels.
- Modify: `scripts/compose-smoke.ts`
  - Remove dummy `TG_ADMIN_CHAT_ID` once config no longer requires it.
- Modify: `scripts/compose-smoke.test.ts`
  - Adjust expectations if the smoke env changes.

Do not commit `docs/superpowers/plans/2026-06-28-admin-notifications-plan.md`.

---

### Task 1: Move Admin Notifications To Structured Core Events

**Files:**
- Modify: `packages/core/src/pending-vat-job.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/pending-vat-job.test.ts`

- [ ] **Step 1: Write failing core tests**

In `packages/core/src/pending-vat-job.test.ts`, replace the current Telegram-admin assertion test with tests that expect an injected admin notifier to receive a structured event.

Add these helpers near the top of the test file:

```ts
type SentAdminNotification = {
  type: 'pending-vat-unrecoverable-error';
  severity: 'error';
  vatNumber: string;
  errorMessage: string;
  request: PendingVatRequest;
};

function baseJobDeps(
  repository: PendingVatJobRepository,
  sentMessages: Array<{ telegramChatId: string; message: string }>
) {
  return {
    repository,
    telegram: {
      sendMessage: async (telegramChatId: string, message: string) => {
        sentMessages.push({ telegramChatId, message });
      }
    },
    now: () => new Date('2026-06-21T00:00:00.000Z')
  };
}
```

Change existing test calls from:

```ts
config: { notifyAdminOnUnrecoverableErrors: false },
```

to:

```ts
config: {},
```

Replace `demotes a request and notifies user and admin after an unrecoverable error` with:

```ts
test('demotes a request and emits a structured admin notification after an unrecoverable error', async () => {
  repository.requests.push(pendingVatRequest);
  const adminNotifications: SentAdminNotification[] = [];

  const result = await processPendingVatRequests({
    ...baseJobDeps(repository, sentMessages),
    vies: {
      checkVatNumber: async () => {
        throw new Error('unexpected parser failure');
      }
    },
    config: {},
    adminNotifier: {
      notify: async (notification) => {
        adminNotifications.push(notification);
      }
    }
  });

  expect(result).toEqual({
    type: 'processed-with-unrecoverable-errors',
    processedCount: 1
  });
  expect(repository.requests).toEqual([]);
  expect(repository.errors).toEqual([
    { request: pendingVatRequest, message: 'unexpected parser failure' }
  ]);
  expect(sentMessages).toEqual([
    {
      telegramChatId: '123',
      message:
        "🔴 Sorry, something went wrong and we had to stop monitoring the VAT number 'XX123'. We'll investigate what happened and try to resume monitoring. We'll notify you when that happens. Sorry for the inconvenience."
    }
  ]);
  expect(adminNotifications).toEqual([
    {
      type: 'pending-vat-unrecoverable-error',
      severity: 'error',
      vatNumber: 'XX123',
      errorMessage: 'unexpected parser failure',
      request: pendingVatRequest
    }
  ]);
});
```

Add a test for optional admin notifications:

```ts
test('does not require an admin notifier for unrecoverable errors', async () => {
  repository.requests.push(pendingVatRequest);

  const result = await processPendingVatRequests({
    ...baseJobDeps(repository, sentMessages),
    vies: {
      checkVatNumber: async () => {
        throw new Error('unexpected parser failure');
      }
    },
    config: {}
  });

  expect(result).toEqual({
    type: 'processed-with-unrecoverable-errors',
    processedCount: 1
  });
  expect(repository.errors).toEqual([
    { request: pendingVatRequest, message: 'unexpected parser failure' }
  ]);
  expect(sentMessages.map((message) => message.telegramChatId)).toEqual([
    '123'
  ]);
});
```

Add a test that a failing admin notifier does not break the job:

```ts
test('continues processing when the admin notifier fails', async () => {
  repository.requests.push(pendingVatRequest);

  const result = await processPendingVatRequests({
    ...baseJobDeps(repository, sentMessages),
    vies: {
      checkVatNumber: async () => {
        throw new Error('unexpected parser failure');
      }
    },
    config: {},
    adminNotifier: {
      notify: async () => {
        throw new Error('admin channel failed');
      }
    }
  });

  expect(result).toEqual({
    type: 'processed-with-unrecoverable-errors',
    processedCount: 1
  });
  expect(repository.errors).toEqual([
    { request: pendingVatRequest, message: 'unexpected parser failure' }
  ]);
  expect(sentMessages.map((message) => message.telegramChatId)).toEqual([
    '123'
  ]);
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```bash
bun test packages/core/src/pending-vat-job.test.ts
```

Expected: FAIL because `adminNotifier` is not accepted in `PendingVatJobDependencies`, and the old config fields are still required.

- [ ] **Step 3: Implement core types and notifier call**

In `packages/core/src/pending-vat-job.ts`, replace `PendingVatJobConfig` with:

```ts
export type AdminNotification = {
  type: 'pending-vat-unrecoverable-error';
  severity: 'error';
  vatNumber: string;
  errorMessage: string;
  request: PendingVatRequest;
};

export interface AdminNotifier {
  notify(notification: AdminNotification): Promise<void>;
}

export interface PendingVatJobConfig {}
```

Update `PendingVatJobDependencies`:

```ts
export interface PendingVatJobDependencies {
  repository: PendingVatRequestRepository;
  vies: ViesClient;
  telegram: TelegramNotifier;
  config: PendingVatJobConfig;
  adminNotifier?: AdminNotifier;
  now?: () => Date;
}
```

Replace the old admin Telegram block in `demoteAndNotify` with:

```ts
  if (deps.adminNotifier) {
    try {
      await deps.adminNotifier.notify({
        type: 'pending-vat-unrecoverable-error',
        severity: 'error',
        vatNumber,
        errorMessage: message,
        request: vatRequest
      });
    } catch {
      // Admin notifications are operational diagnostics; they must not break
      // the user-facing recovery path for a failed VAT request.
    }
  }
```

In `packages/core/src/index.ts`, ensure it exports from `pending-vat-job.ts` as it does today. If it already has `export * from './pending-vat-job';`, no change is needed.

- [ ] **Step 4: Run the focused passing test**

Run:

```bash
bun test packages/core/src/pending-vat-job.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: FAIL in `apps/pending-vat-worker` because it still maps old admin config into the core job config. That failure is expected and is fixed in later tasks.

- [ ] **Step 6: Commit public code only**

Do not include `docs/`.

```bash
git add packages/core/src/pending-vat-job.ts packages/core/src/index.ts packages/core/src/pending-vat-job.test.ts
git commit -m "refactor: emit structured admin notifications"
```

---

### Task 2: Parse Multi-Channel Admin Notification Config

**Files:**
- Modify: `packages/config/src/index.ts`
- Modify: `packages/config/src/index.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing config tests**

In `packages/config/src/index.test.ts`, update the expected `admin` shape in `parses required backend environment` to:

```ts
adminNotifications: {
  channels: ['telegram'],
  telegram: {
    chatIds: ['123', '456']
  },
  ntfy: {
    token: undefined,
    topic: undefined,
    url: undefined
  }
},
```

Set these env vars in that test:

```ts
ADMIN_NOTIFICATION_CHANNELS: 'telegram',
ADMIN_TELEGRAM_CHAT_IDS: '123,456',
```

Update `uses defaults for optional backend environment`:

```ts
expect(config.adminNotifications).toEqual({
  channels: [],
  telegram: {
    chatIds: []
  },
  ntfy: {
    token: undefined,
    topic: undefined,
    url: undefined
  }
});
```

Add tests:

```ts
test('parses logger admin notification channel without channel-specific settings', () => {
  const config = parseBackendConfig({
    DATABASE_HOST: 'db',
    DATABASE_NAME: 'viesvatchecker',
    DATABASE_PASSWORD: 'postgres-password',
    DATABASE_USER: 'backend',
    INTERNAL_API_TOKEN: 'internal-token',
    TG_BOT_TOKEN: 'telegram-token',
    VIES_URL: 'https://example.com/vies.wsdl',
    ADMIN_NOTIFICATION_CHANNELS: 'logger'
  });

  expect(config.adminNotifications.channels).toEqual(['logger']);
});

test('parses ntfy admin notification channel and token file fallback', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vies-config-'));
  tempDirs.push(dir);
  const ntfyTokenFile = join(dir, 'ntfy-token');
  writeFileSync(ntfyTokenFile, 'ntfy-secret\n');

  const config = parseBackendConfig({
    DATABASE_HOST: 'db',
    DATABASE_NAME: 'viesvatchecker',
    DATABASE_PASSWORD: 'postgres-password',
    DATABASE_USER: 'backend',
    INTERNAL_API_TOKEN: 'internal-token',
    TG_BOT_TOKEN: 'telegram-token',
    VIES_URL: 'https://example.com/vies.wsdl',
    ADMIN_NOTIFICATION_CHANNELS: 'ntfy',
    ADMIN_NTFY_URL: 'https://ntfy.example.com',
    ADMIN_NTFY_TOPIC: 'vies-alerts',
    ADMIN_NTFY_TOKEN_FILE: ntfyTokenFile
  });

  expect(config.adminNotifications).toEqual({
    channels: ['ntfy'],
    telegram: {
      chatIds: []
    },
    ntfy: {
      token: 'ntfy-secret',
      topic: 'vies-alerts',
      url: 'https://ntfy.example.com'
    }
  });
});

test('rejects telegram admin notification channel without chat ids', () => {
  expect(() =>
    parseBackendConfig({
      DATABASE_HOST: 'db',
      DATABASE_NAME: 'viesvatchecker',
      DATABASE_PASSWORD: 'postgres-password',
      DATABASE_USER: 'backend',
      INTERNAL_API_TOKEN: 'internal-token',
      TG_BOT_TOKEN: 'telegram-token',
      VIES_URL: 'https://example.com/vies.wsdl',
      ADMIN_NOTIFICATION_CHANNELS: 'telegram'
    })
  ).toThrow('ADMIN_TELEGRAM_CHAT_IDS');
});

test('rejects ntfy admin notification channel without url or topic', () => {
  expect(() =>
    parseBackendConfig({
      DATABASE_HOST: 'db',
      DATABASE_NAME: 'viesvatchecker',
      DATABASE_PASSWORD: 'postgres-password',
      DATABASE_USER: 'backend',
      INTERNAL_API_TOKEN: 'internal-token',
      TG_BOT_TOKEN: 'telegram-token',
      VIES_URL: 'https://example.com/vies.wsdl',
      ADMIN_NOTIFICATION_CHANNELS: 'ntfy'
    })
  ).toThrow('ADMIN_NTFY_URL');
  expect(() =>
    parseBackendConfig({
      DATABASE_HOST: 'db',
      DATABASE_NAME: 'viesvatchecker',
      DATABASE_PASSWORD: 'postgres-password',
      DATABASE_USER: 'backend',
      INTERNAL_API_TOKEN: 'internal-token',
      TG_BOT_TOKEN: 'telegram-token',
      VIES_URL: 'https://example.com/vies.wsdl',
      ADMIN_NOTIFICATION_CHANNELS: 'ntfy',
      ADMIN_NTFY_URL: 'https://ntfy.example.com'
    })
  ).toThrow('ADMIN_NTFY_TOPIC');
});

test('maps legacy admin notification env to telegram channel', () => {
  const config = parseBackendConfig({
    DATABASE_HOST: 'db',
    DATABASE_NAME: 'viesvatchecker',
    DATABASE_PASSWORD: 'postgres-password',
    DATABASE_USER: 'backend',
    INTERNAL_API_TOKEN: 'internal-token',
    TG_BOT_TOKEN: 'telegram-token',
    VIES_URL: 'https://example.com/vies.wsdl',
    NOTIFY_ADMIN_ON_UNRECOVERABLE_ERRORS: 'true',
    TG_ADMIN_CHAT_ID: '123'
  });

  expect(config.adminNotifications).toEqual({
    channels: ['telegram'],
    telegram: {
      chatIds: ['123']
    },
    ntfy: {
      token: undefined,
      topic: undefined,
      url: undefined
    }
  });
});
```

- [ ] **Step 2: Run the focused failing config tests**

Run:

```bash
bun test packages/config/src/index.test.ts
```

Expected: FAIL because `adminNotifications` does not exist yet.

- [ ] **Step 3: Implement config parsing**

In `packages/config/src/index.ts`, add helper schemas:

```ts
const AdminNotificationChannelSchema = z.enum(['logger', 'telegram', 'ntfy']);

const envCsv = z
  .string()
  .trim()
  .optional()
  .transform((value) =>
    value
      ? value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : []
  );
```

Extend `BackendEnvSchema`:

```ts
  ADMIN_NOTIFICATION_CHANNELS: envCsv.default([]),
  ADMIN_TELEGRAM_CHAT_IDS: envCsv.default([]),
  ADMIN_NTFY_URL: envUrl.optional(),
  ADMIN_NTFY_TOPIC: envString.optional(),
  ADMIN_NTFY_TOKEN: envString.optional(),
```

Update `BackendConfig`:

```ts
export type AdminNotificationChannel = 'logger' | 'telegram' | 'ntfy';

export type BackendConfig = {
  adminNotifications: {
    channels: AdminNotificationChannel[];
    telegram: {
      chatIds: string[];
    };
    ntfy: {
      token?: string;
      topic?: string;
      url?: string;
    };
  };
  database: {
```

Update `resolveSecretFiles` in `parseBackendConfig`:

```ts
  const preparedEnv = resolveSecretFiles(env, {
    ADMIN_NTFY_TOKEN: 'ADMIN_NTFY_TOKEN_FILE',
    DATABASE_PASSWORD: 'DATABASE_PASSWORD_FILE',
    INTERNAL_API_TOKEN: 'INTERNAL_API_TOKEN_FILE',
    TG_BOT_TOKEN: 'TG_BOT_TOKEN_FILE'
  });
```

After parsing, resolve admin notifications:

```ts
  const adminNotifications = parseAdminNotificationConfig(parsed.data);
```

Return it in `BackendConfig`:

```ts
    adminNotifications,
```

Add helper functions below `parseAdminWebConfig`:

```ts
type ParsedBackendEnv = z.infer<typeof BackendEnvSchema>;

function parseAdminNotificationConfig(env: ParsedBackendEnv) {
  const explicitChannels = env.ADMIN_NOTIFICATION_CHANNELS.map((channel) =>
    AdminNotificationChannelSchema.parse(channel)
  );
  const legacyTelegramEnabled =
    explicitChannels.length === 0 &&
    env.NOTIFY_ADMIN_ON_UNRECOVERABLE_ERRORS &&
    Boolean(env.TG_ADMIN_CHAT_ID);
  const channels = legacyTelegramEnabled ? ['telegram'] : explicitChannels;
  const telegramChatIds = legacyTelegramEnabled
    ? [env.TG_ADMIN_CHAT_ID as string]
    : env.ADMIN_TELEGRAM_CHAT_IDS;

  if (channels.includes('telegram') && telegramChatIds.length === 0) {
    throw new Error('Invalid configuration: ADMIN_TELEGRAM_CHAT_IDS');
  }

  if (channels.includes('ntfy') && !env.ADMIN_NTFY_URL) {
    throw new Error('Invalid configuration: ADMIN_NTFY_URL');
  }

  if (channels.includes('ntfy') && !env.ADMIN_NTFY_TOPIC) {
    throw new Error('Invalid configuration: ADMIN_NTFY_TOPIC');
  }

  return {
    channels,
    telegram: {
      chatIds: telegramChatIds
    },
    ntfy: {
      token: env.ADMIN_NTFY_TOKEN,
      topic: env.ADMIN_NTFY_TOPIC,
      url: env.ADMIN_NTFY_URL
    }
  };
}
```

Remove `admin` from `BackendConfig` and `parseBackendConfig` return once no code reads it. If TypeScript failures are still present because the worker is not migrated yet, keep only enough temporary compatibility for the current task:

```ts
admin: {
  notifyOnUnrecoverableErrors: false,
  telegramChatId: undefined
},
```

Then remove it in Task 4 after worker wiring is updated.

- [ ] **Step 4: Update `.env.example`**

Add the public new configuration near the Telegram section:

```env
# Optional comma-separated admin notification channels: logger,telegram,ntfy.
ADMIN_NOTIFICATION_CHANNELS=
ADMIN_TELEGRAM_CHAT_IDS=
ADMIN_NTFY_URL=
ADMIN_NTFY_TOPIC=
ADMIN_NTFY_TOKEN=
ADMIN_NTFY_TOKEN_FILE=
```

- [ ] **Step 5: Run focused config tests**

Run:

```bash
bun test packages/config/src/index.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit public code only**

Do not include `docs/`.

```bash
git add packages/config/src/index.ts packages/config/src/index.test.ts .env.example
git commit -m "feat: configure admin notification channels"
```

---

### Task 3: Add Admin Notification Adapters

**Files:**
- Create: `packages/adapters/src/admin-notifications.ts`
- Create: `packages/adapters/src/admin-notifications.test.ts`
- Modify: `packages/adapters/src/index.ts`

- [ ] **Step 1: Write failing adapter tests**

Create `packages/adapters/src/admin-notifications.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import type { AdminNotification } from '@viesvatchecker/core';
import {
  createFanOutAdminNotifier,
  createLoggerAdminNotifier,
  createNtfyAdminNotifier,
  createTelegramAdminNotifier,
  formatAdminNotification
} from './admin-notifications';

const notification: AdminNotification = {
  type: 'pending-vat-unrecoverable-error',
  severity: 'error',
  vatNumber: 'PL1234567890',
  errorMessage: 'unexpected parser failure',
  request: {
    telegramChatId: '123',
    countryCode: 'PL',
    vatNumber: '1234567890',
    expirationDate: new Date('2026-07-01T00:00:00.000Z')
  }
};

describe('formatAdminNotification', () => {
  test('formats unrecoverable pending VAT errors', () => {
    expect(formatAdminNotification(notification)).toEqual({
      title: 'VIES VAT checker error',
      message:
        "There was an error while processing VAT number 'PL1234567890': unexpected parser failure",
      priority: 'high',
      tags: ['rotating_light']
    });
  });
});

test('logger admin notifier writes the formatted notification', async () => {
  const logs: unknown[][] = [];
  const notifier = createLoggerAdminNotifier({
    logger: {
      error: (...args: unknown[]) => logs.push(args)
    }
  });

  await notifier.notify(notification);

  expect(logs).toEqual([
    [
      '[admin-notification]',
      'VIES VAT checker error',
      "There was an error while processing VAT number 'PL1234567890': unexpected parser failure"
    ]
  ]);
});

test('telegram admin notifier sends a formatted message to every chat id', async () => {
  const sent: Array<{ chatId: string; text: string }> = [];
  const notifier = createTelegramAdminNotifier({
    chatIds: ['admin-1', 'admin-2'],
    telegram: {
      sendMessage: async (chatId, text) => {
        sent.push({ chatId, text });
      }
    }
  });

  await notifier.notify(notification);

  expect(sent).toEqual([
    {
      chatId: 'admin-1',
      text:
        "🔴 [ADMIN] There was an error while processing VAT number 'PL1234567890': unexpected parser failure"
    },
    {
      chatId: 'admin-2',
      text:
        "🔴 [ADMIN] There was an error while processing VAT number 'PL1234567890': unexpected parser failure"
    }
  ]);
});

test('ntfy admin notifier posts the formatted notification', async () => {
  const requests: Request[] = [];
  const notifier = createNtfyAdminNotifier({
    url: 'https://ntfy.example.com',
    topic: 'vies-alerts',
    token: 'secret-token',
    fetch: async (request) => {
      requests.push(request);
      return new Response('', { status: 200 });
    }
  });

  await notifier.notify(notification);

  expect(requests).toHaveLength(1);
  const request = requests[0];
  expect(request.url).toBe('https://ntfy.example.com/vies-alerts');
  expect(request.method).toBe('POST');
  expect(request.headers.get('title')).toBe('VIES VAT checker error');
  expect(request.headers.get('priority')).toBe('high');
  expect(request.headers.get('tags')).toBe('rotating_light');
  expect(request.headers.get('authorization')).toBe('Bearer secret-token');
  expect(await request.text()).toBe(
    "There was an error while processing VAT number 'PL1234567890': unexpected parser failure"
  );
});

test('ntfy admin notifier throws on non-2xx responses', async () => {
  const notifier = createNtfyAdminNotifier({
    url: 'https://ntfy.example.com',
    topic: 'vies-alerts',
    fetch: async () => new Response('nope', { status: 500 })
  });

  await expect(notifier.notify(notification)).rejects.toThrow(
    'ntfy notification failed: 500'
  );
});

test('fan-out notifier calls every notifier and logs channel failures', async () => {
  const calls: string[] = [];
  const errors: unknown[][] = [];
  const notifier = createFanOutAdminNotifier({
    logger: {
      error: (...args: unknown[]) => errors.push(args)
    },
    notifiers: [
      {
        name: 'first',
        notifier: {
          notify: async () => {
            calls.push('first');
          }
        }
      },
      {
        name: 'second',
        notifier: {
          notify: async () => {
            calls.push('second');
            throw new Error('second failed');
          }
        }
      },
      {
        name: 'third',
        notifier: {
          notify: async () => {
            calls.push('third');
          }
        }
      }
    ]
  });

  await notifier.notify(notification);

  expect(calls).toEqual(['first', 'second', 'third']);
  expect(errors[0]?.[0]).toBe('[admin-notification]');
  expect(errors[0]?.[1]).toBe('second failed');
});
```

- [ ] **Step 2: Run failing adapter tests**

Run:

```bash
bun test packages/adapters/src/admin-notifications.test.ts
```

Expected: FAIL because `admin-notifications.ts` does not exist yet.

- [ ] **Step 3: Implement adapters**

Create `packages/adapters/src/admin-notifications.ts`:

```ts
import type { AdminNotification, AdminNotifier } from '@viesvatchecker/core';
import type { TelegramMessenger } from './telegram-api';

type Fetch = (request: Request) => Promise<Response>;

export type FormattedAdminNotification = {
  title: string;
  message: string;
  priority: 'high';
  tags: string[];
};

export interface AdminNotificationLogger {
  error(...args: unknown[]): void;
}

export function formatAdminNotification(
  notification: AdminNotification
): FormattedAdminNotification {
  switch (notification.type) {
    case 'pending-vat-unrecoverable-error':
      return {
        title: 'VIES VAT checker error',
        message: `There was an error while processing VAT number '${notification.vatNumber}': ${notification.errorMessage}`,
        priority: 'high',
        tags: ['rotating_light']
      };
  }
}

export function createLoggerAdminNotifier(options: {
  logger?: AdminNotificationLogger;
}): AdminNotifier {
  const logger = options.logger ?? console;

  return {
    async notify(notification) {
      const formatted = formatAdminNotification(notification);
      logger.error(
        '[admin-notification]',
        formatted.title,
        formatted.message
      );
    }
  };
}

export function createTelegramAdminNotifier(options: {
  chatIds: string[];
  telegram: TelegramMessenger;
}): AdminNotifier {
  return {
    async notify(notification) {
      const formatted = formatAdminNotification(notification);
      const text = `🔴 [ADMIN] ${formatted.message}`;

      for (const chatId of options.chatIds) {
        await options.telegram.sendMessage(chatId, text);
      }
    }
  };
}

export function createNtfyAdminNotifier(options: {
  fetch?: Fetch;
  token?: string;
  topic: string;
  url: string;
}): AdminNotifier {
  const fetchImpl = options.fetch ?? fetch;

  return {
    async notify(notification) {
      const formatted = formatAdminNotification(notification);
      const url = new URL(options.topic, ensureTrailingSlash(options.url));
      const headers = new Headers({
        priority: formatted.priority,
        tags: formatted.tags.join(','),
        title: formatted.title
      });

      if (options.token) {
        headers.set('authorization', `Bearer ${options.token}`);
      }

      const response = await fetchImpl(
        new Request(url, {
          body: formatted.message,
          headers,
          method: 'POST'
        })
      );

      if (!response.ok) {
        throw new Error(`ntfy notification failed: ${response.status}`);
      }
    }
  };
}

export function createFanOutAdminNotifier(options: {
  logger?: AdminNotificationLogger;
  notifiers: Array<{ name: string; notifier: AdminNotifier }>;
}): AdminNotifier {
  const logger = options.logger ?? console;

  return {
    async notify(notification) {
      for (const item of options.notifiers) {
        try {
          await item.notifier.notify(notification);
        } catch (error) {
          logger.error(
            '[admin-notification]',
            `${item.name} failed`,
            error instanceof Error ? error.message : error
          );
        }
      }
    }
  };
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}
```

Modify `packages/adapters/src/index.ts`:

```ts
export * from './admin-notifications';
export * from './database-url';
export * from './telegram-api';
export * from './vies-client';
```

- [ ] **Step 4: Run focused adapter tests**

Run:

```bash
bun test packages/adapters/src/admin-notifications.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit public code only**

Do not include `docs/`.

```bash
git add packages/adapters/src/admin-notifications.ts packages/adapters/src/admin-notifications.test.ts packages/adapters/src/index.ts
git commit -m "feat: add admin notification adapters"
```

---

### Task 4: Wire Admin Notifiers Into Pending VAT Worker

**Files:**
- Modify: `apps/pending-vat-worker/src/index.ts`
- Modify: `apps/pending-vat-worker/src/index.test.ts`
- Modify: `scripts/compose-smoke.ts`
- Modify: `scripts/compose-smoke.test.ts`

- [ ] **Step 1: Write failing worker tests**

In `apps/pending-vat-worker/src/index.test.ts`, change the first `runPendingVatWorker` call to:

```ts
const result = await runPendingVatWorker({
  now: () => new Date('2026-06-21T00:00:00.000Z'),
  repository: {
```

Remove the `config` object from that call.

Replace `createPendingVatWorkerRuntime maps config into pending job config` with:

```ts
test('createPendingVatWorkerRuntime builds a logger admin notifier when configured', async () => {
  const adminLogs: unknown[][] = [];

  const runtime = createPendingVatWorkerRuntime({
    config: {
      adminNotifications: {
        channels: ['logger'],
        telegram: {
          chatIds: []
        },
        ntfy: {
          token: undefined,
          topic: undefined,
          url: undefined
        }
      }
    },
    logger: {
      error: (...args: unknown[]) => adminLogs.push(args)
    },
    repository: {
      getAllVatRequests: async () => [
        {
          telegramChatId: '123',
          countryCode: 'PL',
          vatNumber: '1234567890',
          expirationDate: new Date('2026-07-01T00:00:00.000Z')
        }
      ],
      removeVatRequest: async () => false,
      demoteVatRequestToError: async () => null
    },
    telegram: {
      sendMessage: async () => {}
    },
    vies: {
      checkVatNumber: async () => {
        throw new Error('boom');
      }
    }
  });

  const result = await runtime.run();

  expect(result).toEqual({
    type: 'processed-with-unrecoverable-errors',
    processedCount: 1
  });
  expect(adminLogs[0]).toEqual([
    '[admin-notification]',
    'VIES VAT checker error',
    "There was an error while processing VAT number 'PL1234567890': boom"
  ]);
});
```

Add a test for Telegram + ntfy fan-out:

```ts
test('createPendingVatWorkerRuntime builds telegram and ntfy admin notifiers when configured', async () => {
  const sentMessages: Array<{ chatId: string; text: string }> = [];
  const ntfyRequests: Request[] = [];

  const runtime = createPendingVatWorkerRuntime({
    config: {
      adminNotifications: {
        channels: ['telegram', 'ntfy'],
        telegram: {
          chatIds: ['admin-1', 'admin-2']
        },
        ntfy: {
          token: 'ntfy-token',
          topic: 'vies-alerts',
          url: 'https://ntfy.example.com'
        }
      }
    },
    fetch: async (request) => {
      ntfyRequests.push(request);
      return new Response('', { status: 200 });
    },
    repository: {
      getAllVatRequests: async () => [
        {
          telegramChatId: '123',
          countryCode: 'PL',
          vatNumber: '1234567890',
          expirationDate: new Date('2026-07-01T00:00:00.000Z')
        }
      ],
      removeVatRequest: async () => false,
      demoteVatRequestToError: async () => null
    },
    telegram: {
      sendMessage: async (chatId, text) => {
        sentMessages.push({ chatId, text });
      }
    },
    vies: {
      checkVatNumber: async () => {
        throw new Error('boom');
      }
    }
  });

  await runtime.run();

  expect(sentMessages.map((message) => message.chatId)).toEqual([
    '123',
    'admin-1',
    'admin-2'
  ]);
  expect(ntfyRequests).toHaveLength(1);
  expect(ntfyRequests[0].url).toBe('https://ntfy.example.com/vies-alerts');
});
```

Update `startPendingVatWorker runs without database migrations` to include:

```ts
ADMIN_NOTIFICATION_CHANNELS: 'logger',
```

and add `logger` to the fake dependencies if the production dependency interface requires it.

- [ ] **Step 2: Run failing worker tests**

Run:

```bash
bun test apps/pending-vat-worker/src/index.test.ts
```

Expected: FAIL because the runtime does not create admin notifiers from `adminNotifications` yet.

- [ ] **Step 3: Implement worker wiring**

In `apps/pending-vat-worker/src/index.ts`, update imports:

```ts
import {
  buildDatabaseUrl,
  createFanOutAdminNotifier,
  createLoggerAdminNotifier,
  createNtfyAdminNotifier,
  createTelegramAdminNotifier,
  createTelegramApi,
  createViesHttpClient,
  type AdminNotificationLogger,
  type TelegramMessenger
} from '@viesvatchecker/adapters';
import type { BackendConfig } from '@viesvatchecker/config';
```

Add `Fetch` and update runtime options:

```ts
type Fetch = (request: Request) => Promise<Response>;

export interface PendingVatWorkerRuntimeOptions {
  config: Pick<BackendConfig, 'adminNotifications'>;
  fetch?: Fetch;
  logger?: AdminNotificationLogger;
  now?: () => Date;
  repository: PendingVatRequestRepository;
  telegram: TelegramMessenger;
  vies: PendingVatJobDependencies['vies'];
}
```

Add a helper:

```ts
function createConfiguredAdminNotifier(options: {
  config: BackendConfig['adminNotifications'];
  fetch?: Fetch;
  logger?: AdminNotificationLogger;
  telegram: TelegramMessenger;
}) {
  const notifiers = options.config.channels.map((channel) => {
    switch (channel) {
      case 'logger':
        return {
          name: 'logger',
          notifier: createLoggerAdminNotifier({ logger: options.logger })
        };
      case 'telegram':
        return {
          name: 'telegram',
          notifier: createTelegramAdminNotifier({
            chatIds: options.config.telegram.chatIds,
            telegram: options.telegram
          })
        };
      case 'ntfy':
        return {
          name: 'ntfy',
          notifier: createNtfyAdminNotifier({
            fetch: options.fetch,
            token: options.config.ntfy.token,
            topic: options.config.ntfy.topic as string,
            url: options.config.ntfy.url as string
          })
        };
    }
  });

  if (notifiers.length === 0) {
    return undefined;
  }

  return createFanOutAdminNotifier({
    logger: options.logger,
    notifiers
  });
}
```

Update `createPendingVatWorkerRuntime`:

```ts
export function createPendingVatWorkerRuntime(
  options: PendingVatWorkerRuntimeOptions
) {
  const adminNotifier = createConfiguredAdminNotifier({
    config: options.config.adminNotifications,
    fetch: options.fetch,
    logger: options.logger,
    telegram: options.telegram
  });

  return {
    async run(): Promise<PendingVatJobResult> {
      return await runPendingVatWorker({
        adminNotifier,
        config: {},
        now: options.now,
        repository: options.repository,
        telegram: options.telegram,
        vies: options.vies
      });
    }
  };
}
```

Update `startPendingVatWorker` runtime creation:

```ts
    const runtime = createPendingVatWorkerRuntime({
      config,
      repository: resolvedDeps.createRepository(postgresClient.db),
      telegram: resolvedDeps.createTelegram(config.telegram.botToken),
      vies: resolvedDeps.createVies(config.vies.url)
    });
```

No `logger` is needed here because the default is `console`.

- [ ] **Step 4: Update compose smoke env**

In `scripts/compose-smoke.ts`, remove dummy `TG_ADMIN_CHAT_ID` if present in generated env. Leave admin notifications disabled unless a test explicitly needs logger:

```ts
ADMIN_NOTIFICATION_CHANNELS: '',
```

If `scripts/compose-smoke.test.ts` asserts the generated env, update it to expect `ADMIN_NOTIFICATION_CHANNELS` and not `TG_ADMIN_CHAT_ID`.

- [ ] **Step 5: Run focused worker and smoke-script tests**

Run:

```bash
bun test apps/pending-vat-worker/src/index.test.ts scripts/compose-smoke.test.ts
```

Expected: PASS.

- [ ] **Step 6: Remove temporary config compatibility if kept**

If Task 2 left `BackendConfig['admin']` in place only to keep TypeScript green, remove it now from `packages/config/src/index.ts` and update any remaining tests or call sites to use `adminNotifications`.

Run:

```bash
rg "notifyOnUnrecoverableErrors|adminTelegramChatId|TG_ADMIN_CHAT_ID|BackendConfig\\['admin'\\]"
```

Expected: only legacy env parsing/tests may reference `TG_ADMIN_CHAT_ID` and `NOTIFY_ADMIN_ON_UNRECOVERABLE_ERRORS`. No runtime code should read the old admin shape.

- [ ] **Step 7: Commit public code only**

Do not include `docs/`.

```bash
git add apps/pending-vat-worker/src/index.ts apps/pending-vat-worker/src/index.test.ts scripts/compose-smoke.ts scripts/compose-smoke.test.ts packages/config/src/index.ts packages/config/src/index.test.ts
git commit -m "feat: wire admin notification fanout"
```

---

### Task 5: Update Compose And Public Self-Hosting Docs

**Files:**
- Modify: `docker-compose.yml`
- Modify: `SELF_HOSTING.md`

- [ ] **Step 1: Update compose environment**

In `docker-compose.yml`, under the `pending-vat-worker` service environment, add:

```yaml
      ADMIN_NOTIFICATION_CHANNELS: ${ADMIN_NOTIFICATION_CHANNELS:-}
      ADMIN_TELEGRAM_CHAT_IDS: ${ADMIN_TELEGRAM_CHAT_IDS:-}
      ADMIN_NTFY_URL: ${ADMIN_NTFY_URL:-}
      ADMIN_NTFY_TOPIC: ${ADMIN_NTFY_TOPIC:-}
      ADMIN_NTFY_TOKEN: ${ADMIN_NTFY_TOKEN:-}
      ADMIN_NTFY_TOKEN_FILE: ${ADMIN_NTFY_TOKEN_FILE:-}
```

Do not add legacy `NOTIFY_ADMIN_ON_UNRECOVERABLE_ERRORS` or `TG_ADMIN_CHAT_ID` to public compose examples.

- [ ] **Step 2: Update `SELF_HOSTING.md`**

Add a concise section:

```md
### Admin Notifications

Admin notifications are disabled by default. Enable one or more channels with `ADMIN_NOTIFICATION_CHANNELS`, using a comma-separated list:

```env
ADMIN_NOTIFICATION_CHANNELS=logger
```

`logger` writes admin alerts to the worker logs and is useful for local development.

Telegram sends admin alerts through the bot:

```env
ADMIN_NOTIFICATION_CHANNELS=telegram
ADMIN_TELEGRAM_CHAT_IDS=123456789,987654321
```

ntfy sends alerts to an ntfy topic:

```env
ADMIN_NOTIFICATION_CHANNELS=ntfy
ADMIN_NTFY_URL=https://ntfy.example.com
ADMIN_NTFY_TOPIC=vies-alerts
ADMIN_NTFY_TOKEN_FILE=/run/secrets/ntfy_token
```

Channels can be combined:

```env
ADMIN_NOTIFICATION_CHANNELS=logger,telegram,ntfy
```
```

If the file already has a configuration table, add the variables there instead of duplicating the same information.

- [ ] **Step 3: Run docs-adjacent checks**

Run:

```bash
bun run format:check
bun run lint
```

Expected: PASS.

- [ ] **Step 4: Commit public docs and compose updates**

Do not include `docs/superpowers`.

```bash
git add docker-compose.yml SELF_HOSTING.md
git commit -m "docs: document admin notification channels"
```

---

### Task 6: Full Verification

**Files:**
- No code changes expected unless verification exposes a bug.

- [ ] **Step 1: Run static and unit checks**

Run:

```bash
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run build
```

Expected: all PASS.

- [ ] **Step 2: Run compose smoke**

Run:

```bash
bun run smoke:compose
```

Expected: PASS.

If Docker is unreachable, stop and ask the user to start Docker or OrbStack. Do not work around Docker failures by bypassing compose smoke.

- [ ] **Step 3: Manual local logger check**

Run:

```bash
ADMIN_NOTIFICATION_CHANNELS=logger bun test apps/pending-vat-worker/src/index.test.ts
```

Expected: PASS. The unit test should prove logger wiring without requiring a real VIES failure or Telegram call.

- [ ] **Step 4: Commit verification-only fixes if needed**

If verification required a fix, commit only the changed public files:

```bash
git status --short
git add <public files changed by the fix>
git commit -m "fix: stabilize admin notification checks"
```

If no fix was required, do not create a commit.

---

## Completion Criteria

- Admin notifications are disabled by default.
- Core emits structured `AdminNotification` events and contains no Telegram-specific admin delivery logic.
- A single unrecoverable VAT processing error can notify logger, Telegram, ntfy, or any combination.
- Telegram supports multiple admin chat IDs.
- ntfy supports direct token env and `ADMIN_NTFY_TOKEN_FILE`.
- Admin notification failures are logged and do not prevent user notification or VAT request demotion.
- Public docs describe only the new channel-based configuration.
- Legacy env compatibility exists in config tests but is not the primary public documentation path.
- `bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`, and `bun run smoke:compose` pass.
- `docs/superpowers/plans/2026-06-28-admin-notifications-plan.md` remains uncommitted.
