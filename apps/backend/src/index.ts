import {
  buildDatabaseUrl,
  createTelegramApi,
  createViesHttpClient,
  type TelegramMessenger,
  type TelegramPollingApi,
  type TelegramWebhookApi
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
import { createTelegramTransport } from './telegram-transport';
import { handleTelegramUpdate } from './telegram-updates';

export { buildDatabaseUrl } from '@viesvatchecker/adapters';

interface RuntimeConfig {
  expirationDays: number;
  maxPendingPerUser: number;
  pollingIntervalMs: number;
  transport: 'long-polling' | 'webhook';
  webhook: {
    path: string;
    secretToken?: string;
    url?: string;
  };
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
  telegram: TelegramPollingApi & TelegramWebhookApi & TelegramMessenger;
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
  createTelegram(
    botToken: string
  ): TelegramPollingApi & TelegramWebhookApi & TelegramMessenger;
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
      repository: options.repository,
      telegram: options.telegram
    },
    transport: options.config.transport
  });
  const coreRepository = createCoreVatRequestRepository({
    expirationDays: options.config.expirationDays,
    repository: options.repository
  });
  const transport = createTelegramTransport({
    app,
    config: {
      pollingIntervalMs: options.config.pollingIntervalMs,
      transport: options.config.transport,
      webhook: options.config.webhook
    },
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
    telegram: options.telegram
  });

  return {
    app,
    transport,
    stop: async () => {
      await transport.stop();
    }
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
      pollingIntervalMs: config.telegram.pollingIntervalMs,
      transport: config.telegram.transport,
      webhook: config.telegram.webhook
    },
    repository: resolvedDeps.createRepository(postgresClient.db),
    telegram: resolvedDeps.createTelegram(config.telegram.botToken),
    vies: resolvedDeps.createVies(config.vies.url)
  });

  const server = resolvedDeps.listen(runtime.app, {
    hostname: config.http.host,
    port: config.http.port
  });

  // Start the transport after the HTTP server is listening so webhook
  // deliveries can be served immediately.
  await runtime.transport.start();

  return {
    ...runtime,
    stop: async () => {
      await runtime.stop();
      await server.stop();
      await postgresClient.close();
    }
  };
}

if (import.meta.main) {
  await startBackend();
}
