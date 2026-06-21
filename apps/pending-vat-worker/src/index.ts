import {
  buildDatabaseUrl,
  createTelegramApi,
  createViesHttpClient,
  type TelegramMessenger
} from '@viesvatchecker/adapters';
import { type BackendConfig, parseBackendConfig } from '@viesvatchecker/config';
import {
  type PendingVatJobDependencies,
  type PendingVatJobResult,
  type PendingVatRequestRepository,
  processPendingVatRequests
} from '@viesvatchecker/core';
import {
  createPostgresClient,
  createVatRequestRepository,
  migrateDatabase
} from '@viesvatchecker/db';

export interface PendingVatWorkerRuntimeOptions {
  config: Pick<BackendConfig, 'admin'>;
  now?: () => Date;
  repository: PendingVatRequestRepository;
  telegram: TelegramMessenger;
  vies: PendingVatJobDependencies['vies'];
}

export async function runPendingVatWorker(deps: PendingVatJobDependencies) {
  return await processPendingVatRequests(deps);
}

export function createPendingVatWorkerRuntime(
  options: PendingVatWorkerRuntimeOptions
) {
  return {
    async run(): Promise<PendingVatJobResult> {
      return await runPendingVatWorker({
        config: {
          adminTelegramChatId: options.config.admin.telegramChatId,
          notifyAdminOnUnrecoverableErrors:
            options.config.admin.notifyOnUnrecoverableErrors
        },
        now: options.now,
        repository: options.repository,
        telegram: options.telegram,
        vies: options.vies
      });
    }
  };
}

export async function startPendingVatWorker(
  env: NodeJS.ProcessEnv = process.env
) {
  const config = parseBackendConfig(env);
  const postgresClient = createPostgresClient({
    url: buildDatabaseUrl(config.database),
    maxConnections: 1
  });

  try {
    await migrateDatabase(postgresClient.db);
    const runtime = createPendingVatWorkerRuntime({
      config,
      repository: createVatRequestRepository(postgresClient.db),
      telegram: createTelegramApi({ botToken: config.telegram.botToken }),
      vies: createViesHttpClient({ url: config.vies.url })
    });

    return await runtime.run();
  } finally {
    await postgresClient.close();
  }
}

if (import.meta.main) {
  await startPendingVatWorker();
}
