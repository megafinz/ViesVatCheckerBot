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
  createVatRequestErrorRepository,
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
  internalApiToken: string;
  maxPendingPerUser: number;
  pollingEnabled: boolean;
  pollingIntervalMs: number;
}

type RuntimeRepository = VatRequestRepositoryWithExpiration & {
  getAllVatRequestErrors(): Promise<
    import('@viesvatchecker/core').VatRequestError[]
  >;
  removeVatRequestError(vatRequestErrorId: string): Promise<boolean>;
  resolveVatRequestError(
    vatRequestErrorId: string
  ): Promise<import('@viesvatchecker/db').ResolveVatRequestErrorResult>;
  tryAddUniqueVatRequest(
    request: VatRequest,
    expirationDate: Date
  ): Promise<PendingVatRequest | false>;
  updateVatRequest(
    request: VatRequest,
    update: Pick<VatRequest, 'countryCode' | 'vatNumber'>
  ): Promise<boolean>;
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
  createRepository: (db) => ({
    ...createVatRequestRepository(db),
    ...createVatRequestErrorRepository(db)
  }),
  createTelegram: (botToken) => createTelegramApi({ botToken }),
  createVies: (url) => createViesHttpClient({ url }),
  listen: (app, options) => app.listen(options)
};

export function createBackendRuntime(options: BackendRuntimeOptions) {
  const app = createBackendApp({
    admin: {
      internalApiToken: options.config.internalApiToken,
      repository: options.repository,
      telegram: options.telegram
    },
    pollingEnabled: options.config.pollingEnabled
  });
  const coreRepository = createCoreVatRequestRepository({
    expirationDays: options.config.expirationDays,
    repository: options.repository
  });
  const stopPolling = options.config.pollingEnabled
    ? startPollingLoop({
        intervalMs: options.config.pollingIntervalMs,
        setup: async () => {
          await options.telegram.deleteWebhook();
        },
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
              maxUpdatesPerCycle: 50,
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
      internalApiToken: config.internalApi.token,
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
  setup?: () => Promise<void>;
  pollOnce(offset?: number): Promise<number | undefined>;
}

const MAX_BACKOFF_MS = 60_000;

function startPollingLoop(options: PollingLoopOptions): () => void {
  let offset: number | undefined;
  let stopped = false;
  let timer: Timer | undefined;
  let consecutiveErrors = 0;

  const tick = async () => {
    if (stopped) {
      return;
    }

    try {
      if (options.setup) {
        await options.setup();
      }
      offset = await options.pollOnce(offset);
      consecutiveErrors = 0;
    } catch (error) {
      consecutiveErrors += 1;
      const backoff = Math.min(
        MAX_BACKOFF_MS,
        options.intervalMs * 2 ** (consecutiveErrors - 1)
      );
      console.error(
        `Telegram polling failed (attempt ${consecutiveErrors}); retrying in ${backoff}ms`,
        error
      );
      if (!stopped) {
        timer = setTimeout(tick, backoff);
      }
      return;
    }

    if (!stopped) {
      timer = setTimeout(tick, options.intervalMs);
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
