import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseAdminWebConfig,
  parseBackendConfig,
  parseDatabaseConfig
} from './index';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parses required backend environment', () => {
  const config = parseBackendConfig({
    DATABASE_HOST: 'db',
    DATABASE_NAME: 'viesvatchecker',
    DATABASE_PASSWORD: 'postgres-password',
    DATABASE_PORT: '5433',
    DATABASE_USER: 'backend',
    HOST: '127.0.0.1',
    INTERNAL_API_TOKEN: 'internal-token',
    MAX_PENDING_VAT_NUMBERS_PER_USER: '12',
    NODE_ENV: 'production',
    ADMIN_NOTIFICATION_CHANNELS: 'telegram',
    ADMIN_TELEGRAM_CHAT_IDS: '123,456',
    PORT: '8081',
    TG_BOT_TOKEN: 'telegram-token',
    TG_POLLING_INTERVAL_MS: '1500',
    VAT_NUMBER_EXPIRATION_DAYS: '30',
    VIES_URL: 'https://example.com/vies.wsdl'
  });

  expect(config).toEqual({
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
    database: {
      host: 'db',
      name: 'viesvatchecker',
      password: 'postgres-password',
      port: 5433,
      user: 'backend'
    },
    http: {
      host: '127.0.0.1',
      port: 8081
    },
    internalApi: {
      token: 'internal-token'
    },
    nodeEnv: 'production',
    telegram: {
      botToken: 'telegram-token',
      pollingIntervalMs: 1500,
      pollingEnabled: true
    },
    vatNumbers: {
      expirationDays: 30,
      maxPendingPerUser: 12
    },
    vies: {
      url: 'https://example.com/vies.wsdl'
    }
  });
});

test('uses defaults for optional backend environment', () => {
  const config = parseBackendConfig({
    DATABASE_HOST: 'db',
    DATABASE_NAME: 'viesvatchecker',
    DATABASE_PASSWORD: 'postgres-password',
    DATABASE_USER: 'backend',
    INTERNAL_API_TOKEN: 'internal-token',
    TG_BOT_TOKEN: 'telegram-token',
    VIES_URL: 'https://example.com/vies.wsdl'
  });

  expect(config.http).toEqual({ host: '0.0.0.0', port: 8080 });
  expect(config.nodeEnv).toBe('development');
  expect(config.telegram.pollingEnabled).toBe(true);
  expect(config.telegram.pollingIntervalMs).toBe(1000);
  expect(config.vatNumbers).toEqual({
    expirationDays: 90,
    maxPendingPerUser: 10
  });
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
  expect(config.database.port).toBe(5432);
});

test('reads secret values from file fallbacks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vies-config-'));
  tempDirs.push(dir);
  const databasePasswordFile = join(dir, 'database-password');
  const internalTokenFile = join(dir, 'internal-token');
  const telegramTokenFile = join(dir, 'telegram-token');

  writeFileSync(databasePasswordFile, 'postgres-password\n');
  writeFileSync(internalTokenFile, 'internal-token\n');
  writeFileSync(telegramTokenFile, 'telegram-token\n');

  const config = parseBackendConfig({
    DATABASE_HOST: 'db',
    DATABASE_NAME: 'viesvatchecker',
    DATABASE_PASSWORD_FILE: databasePasswordFile,
    DATABASE_USER: 'backend',
    INTERNAL_API_TOKEN_FILE: internalTokenFile,
    TG_BOT_TOKEN_FILE: telegramTokenFile,
    VIES_URL: 'https://example.com/vies.wsdl'
  });

  expect(config.database.password).toBe('postgres-password');
  expect(config.internalApi.token).toBe('internal-token');
  expect(config.telegram.botToken).toBe('telegram-token');
});

test('direct environment values take precedence over file fallbacks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vies-config-'));
  tempDirs.push(dir);
  const databasePasswordFile = join(dir, 'database-password');
  writeFileSync(databasePasswordFile, 'file-password\n');

  const config = parseBackendConfig({
    DATABASE_HOST: 'db',
    DATABASE_NAME: 'viesvatchecker',
    DATABASE_PASSWORD: 'env-password',
    DATABASE_PASSWORD_FILE: databasePasswordFile,
    DATABASE_USER: 'backend',
    INTERNAL_API_TOKEN: 'internal-token',
    TG_BOT_TOKEN: 'telegram-token',
    VIES_URL: 'https://example.com/vies.wsdl'
  });

  expect(config.database.password).toBe('env-password');
});

test('parses database configuration without non-database service secrets', () => {
  const config = parseDatabaseConfig({
    DATABASE_HOST: 'db',
    DATABASE_NAME: 'viesvatchecker',
    DATABASE_PASSWORD: 'postgres-password',
    DATABASE_PORT: '5432',
    DATABASE_USER: 'migrator'
  });

  expect(config).toEqual({
    host: 'db',
    name: 'viesvatchecker',
    password: 'postgres-password',
    port: 5432,
    user: 'migrator'
  });
});

test('parses required admin web environment', () => {
  const config = parseAdminWebConfig({
    ADMIN_BACKEND_URL: 'http://backend:8080',
    HOST: '127.0.0.1',
    INTERNAL_API_TOKEN: 'internal-token',
    PORT: '18081'
  });

  expect(config).toEqual({
    backend: {
      url: 'http://backend:8080'
    },
    http: {
      host: '127.0.0.1',
      port: 18081
    },
    internalApi: {
      token: 'internal-token'
    }
  });
});

test('admin web configuration reads internal API token from file fallback', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vies-config-'));
  tempDirs.push(dir);
  const internalTokenFile = join(dir, 'internal-token');
  writeFileSync(internalTokenFile, 'internal-token\n');

  const config = parseAdminWebConfig({
    ADMIN_BACKEND_URL: 'http://backend:8080',
    INTERNAL_API_TOKEN_FILE: internalTokenFile
  });

  expect(config.http).toEqual({ host: '0.0.0.0', port: 8081 });
  expect(config.internalApi.token).toBe('internal-token');
});

test('database configuration reads password from file fallback', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vies-config-'));
  tempDirs.push(dir);
  const databasePasswordFile = join(dir, 'database-password');
  writeFileSync(databasePasswordFile, 'postgres-password\n');

  const config = parseDatabaseConfig({
    DATABASE_HOST: 'db',
    DATABASE_NAME: 'viesvatchecker',
    DATABASE_PASSWORD_FILE: databasePasswordFile,
    DATABASE_USER: 'migrator'
  });

  expect(config.password).toBe('postgres-password');
});

test('reports missing required backend environment by variable name', () => {
  expect(() => parseBackendConfig({})).toThrow('DATABASE_HOST');
  expect(() => parseBackendConfig({})).toThrow('DATABASE_NAME');
  expect(() => parseBackendConfig({})).toThrow('DATABASE_USER');
  expect(() => parseBackendConfig({})).toThrow('DATABASE_PASSWORD');
  expect(() => parseBackendConfig({})).toThrow('INTERNAL_API_TOKEN');
  expect(() => parseBackendConfig({})).toThrow('TG_BOT_TOKEN');
  expect(() => parseBackendConfig({})).toThrow('VIES_URL');
});

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
