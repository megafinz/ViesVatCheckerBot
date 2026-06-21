import { type BackendConfig, parseBackendConfig } from '@viesvatchecker/config';
import type {
  PendingVatRequest,
  VatRequest,
  ViesClient
} from '@viesvatchecker/core';
import {
  createPostgresClient,
  createVatRequestRepository,
  migrateDatabase
} from '@viesvatchecker/db';
import { createBackendApp } from './app';
import {
  createCoreVatRequestRepository,
  type VatRequestRepositoryWithExpiration
} from './repository-adapter';
import { createTelegramApi } from './telegram-api';
import { pollTelegramOnce, type TelegramPollingApi } from './telegram-polling';
import {
  handleTelegramUpdate,
  type TelegramMessenger
} from './telegram-updates';
import { createViesHttpClient } from './vies-client';

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

export function buildDatabaseUrl(config: BackendConfig['database']): string {
  const user = encodeURIComponent(config.user);
  const password = encodeURIComponent(config.password);
  return `postgres://${user}:${password}@${config.host}:${config.port}/${config.name}`;
}

export async function startBackend(env: NodeJS.ProcessEnv = process.env) {
  const config = parseBackendConfig(env);
  const postgresClient = createPostgresClient({
    url: buildDatabaseUrl(config.database)
  });
  await migrateDatabase(postgresClient.db);

  const runtime = createBackendRuntime({
    config: {
      expirationDays: config.vatNumbers.expirationDays,
      maxPendingPerUser: config.vatNumbers.maxPendingPerUser,
      pollingEnabled: config.telegram.pollingEnabled,
      pollingIntervalMs: config.telegram.pollingIntervalMs
    },
    repository: createVatRequestRepository(postgresClient.db),
    telegram: createTelegramApi({ botToken: config.telegram.botToken }),
    vies: createViesHttpClient({ url: config.vies.url })
  });

  const server = runtime.app.listen({
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
