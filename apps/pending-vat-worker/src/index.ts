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
  type Database
} from '@viesvatchecker/db';

export interface PendingVatWorkerRuntimeOptions {
  config: Pick<BackendConfig, 'admin'>;
  now?: () => Date;
  repository: PendingVatRequestRepository;
  telegram: TelegramMessenger;
  vies: PendingVatJobDependencies['vies'];
}

interface PendingVatWorkerPostgresClient<Db> {
  close(): Promise<void> | void;
  db: Db;
}

export interface StartPendingVatWorkerDependencies<Db> {
  createPostgresClient(databaseUrl: string): PendingVatWorkerPostgresClient<Db>;
  createRepository(db: Db): PendingVatRequestRepository;
  createTelegram(botToken: string): TelegramMessenger;
  createVies(url: string): PendingVatJobDependencies['vies'];
}

const defaultStartPendingVatWorkerDependencies: StartPendingVatWorkerDependencies<Database> =
  {
    createPostgresClient: (url) =>
      createPostgresClient({
        url,
        maxConnections: 1
      }),
    createRepository: (db) => createVatRequestRepository(db),
    createTelegram: (botToken) => createTelegramApi({ botToken }),
    createVies: (url) => createViesHttpClient({ url })
  };

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
  env?: NodeJS.ProcessEnv
): Promise<PendingVatJobResult>;
export async function startPendingVatWorker<Db>(
  env: NodeJS.ProcessEnv,
  deps: StartPendingVatWorkerDependencies<Db>
): Promise<PendingVatJobResult>;
export async function startPendingVatWorker<Db>(
  env: NodeJS.ProcessEnv = process.env,
  deps?: StartPendingVatWorkerDependencies<Db>
) {
  const resolvedDeps =
    deps ??
    (defaultStartPendingVatWorkerDependencies as unknown as StartPendingVatWorkerDependencies<Db>);
  const config = parseBackendConfig(env);
  const postgresClient = resolvedDeps.createPostgresClient(
    buildDatabaseUrl(config.database)
  );

  try {
    const runtime = createPendingVatWorkerRuntime({
      config,
      repository: resolvedDeps.createRepository(postgresClient.db),
      telegram: resolvedDeps.createTelegram(config.telegram.botToken),
      vies: resolvedDeps.createVies(config.vies.url)
    });

    return await runtime.run();
  } finally {
    await postgresClient.close();
  }
}

if (import.meta.main) {
  await startPendingVatWorker();
}
