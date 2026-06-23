import {
  buildDatabaseUrl,
  createTelegramApi,
  createViesHttpClient,
  type TelegramMessenger,
  type TelegramPollingApi
} from '@viesvatchecker/adapters';
import { parseBackendConfig } from '@viesvatchecker/config';
import type {
  PendingVatRequest,
  VatRequest,
  ViesClient
} from '@viesvatchecker/core';
import {
  createPostgresClient,
  createVatRequestRepository,
  type Database
} from '@viesvatchecker/db';
import { createBackendApp } from './app';
import {
  createCoreVatRequestRepository,
  type VatRequestRepositoryWithExpiration
} from './repository-adapter';
import { pollTelegramOnce } from './telegram-polling';
import { handleTelegramUpdate } from './telegram-updates';

export { buildDatabaseUrl } from '@viesvatchecker/adapters';

interface RuntimeConfig {
  expirationDays: number;
  maxPendingPerUser: number;
  pollingEnabled: boolean;
  pollingIntervalMs: number;
}

type RuntimeRepository = VatRequestRepositoryWithExpiration & {
  tryAddUniqueVatRequest(
    request: VatRequest,
    expirationDate: Date
  ): Promise<PendingVatRequest | false>;
};

export interface BackendRuntimeOptions {
  config: RuntimeConfig;
  repository: RuntimeRepository;
  telegram: TelegramPollingApi & TelegramMessenger;
  vies: ViesClient;
}

interface BackendPostgresClient<Db> {
  close(): Promise<void> | void;
  db: Db;
}

type BackendApp = ReturnType<typeof createBackendRuntime>['app'];

interface BackendServer {
  stop(): Promise<unknown> | unknown;
}

export interface StartBackendDependencies<Db> {
  createPostgresClient(databaseUrl: string): BackendPostgresClient<Db>;
  createRepository(db: Db): RuntimeRepository;
  createTelegram(botToken: string): TelegramPollingApi & TelegramMessenger;
  createVies(url: string): ViesClient;
  listen(
    app: BackendApp,
    options: { hostname: string; port: number }
  ): BackendServer;
}

const defaultStartBackendDependencies: StartBackendDependencies<Database> = {
  createPostgresClient: (url) => createPostgresClient({ url }),
  createRepository: (db) => createVatRequestRepository(db),
  createTelegram: (botToken) => createTelegramApi({ botToken }),
  createVies: (url) => createViesHttpClient({ url }),
  listen: (app, options) => app.listen(options)
};

export function createBackendRuntime(options: BackendRuntimeOptions) {
  const app = createBackendApp({
    pollingEnabled: options.config.pollingEnabled
  });
  const coreRepository = createCoreVatRequestRepository({
    expirationDays: options.config.expirationDays,
    repository: options.repository
  });
  const stopPolling = options.config.pollingEnabled
    ? startPollingLoop({
        intervalMs: options.config.pollingIntervalMs,
        pollOnce: async (offset) =>
          await pollTelegramOnce(
            {
              api: options.telegram,
              handleUpdate: async (update) => {
                await handleTelegramUpdate(update, {
                  config: {
                    expirationDays: options.config.expirationDays,
                    maxPendingPerUser: options.config.maxPendingPerUser
                  },
                  repository: coreRepository,
                  telegram: options.telegram,
                  vies: options.vies
                });
              },
              timeoutSeconds: 30
            },
            offset
          )
      })
    : () => {};

  return {
    app,
    stop: stopPolling
  };
}

export async function startBackend(env?: NodeJS.ProcessEnv): Promise<{
  app: BackendApp;
  stop(): Promise<void>;
}>;
export async function startBackend<Db>(
  env: NodeJS.ProcessEnv,
  deps: StartBackendDependencies<Db>
): Promise<{
  app: BackendApp;
  stop(): Promise<void>;
}>;
export async function startBackend<Db>(
  env: NodeJS.ProcessEnv = process.env,
  deps?: StartBackendDependencies<Db>
) {
  const resolvedDeps =
    deps ??
    (defaultStartBackendDependencies as unknown as StartBackendDependencies<Db>);
  const config = parseBackendConfig(env);
  const postgresClient = resolvedDeps.createPostgresClient(
    buildDatabaseUrl(config.database)
  );

  const runtime = createBackendRuntime({
    config: {
      expirationDays: config.vatNumbers.expirationDays,
      maxPendingPerUser: config.vatNumbers.maxPendingPerUser,
      pollingEnabled: config.telegram.pollingEnabled,
      pollingIntervalMs: config.telegram.pollingIntervalMs
    },
    repository: resolvedDeps.createRepository(postgresClient.db),
    telegram: resolvedDeps.createTelegram(config.telegram.botToken),
    vies: resolvedDeps.createVies(config.vies.url)
  });

  const server = resolvedDeps.listen(runtime.app, {
    hostname: config.http.host,
    port: config.http.port
  });

  return {
    ...runtime,
    stop: async () => {
      runtime.stop();
      await server.stop();
      await postgresClient.close();
    }
  };
}

interface PollingLoopOptions {
  intervalMs: number;
  pollOnce(offset?: number): Promise<number | undefined>;
}

function startPollingLoop(options: PollingLoopOptions): () => void {
  let offset: number | undefined;
  let stopped = false;
  let timer: Timer | undefined;

  const tick = async () => {
    if (stopped) {
      return;
    }

    try {
      offset = await options.pollOnce(offset);
    } catch (error) {
      console.error(error);
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, options.intervalMs);
      }
    }
  };

  timer = setTimeout(tick, 0);

  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
    }
  };
}

if (import.meta.main) {
  await startBackend();
}
