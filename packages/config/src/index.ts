import { readFileSync } from 'node:fs';
import { z } from 'zod';

type Env = Record<string, string | undefined>;

const envString = z.string().trim().min(1);
const envUrl = envString.url();
const envNumber = z.coerce.number().int().positive();

const envBoolean = z.preprocess(
  (value) => (value === undefined ? value : String(value)),
  z
    .string()
    .trim()
    .toLowerCase()
    .transform((value, ctx) => {
      if (['1', 'true', 'yes', 'on'].includes(value)) {
        return true;
      }
      if (['0', 'false', 'no', 'off'].includes(value)) {
        return false;
      }
      ctx.addIssue({
        code: 'custom',
        message: 'Expected a boolean-like value'
      });
      return z.NEVER;
    })
);

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

const BackendEnvSchema = z.object({
  ADMIN_NOTIFICATION_CHANNELS: envCsv.default([]),
  ADMIN_NTFY_TOKEN: envString.optional(),
  ADMIN_NTFY_TOPIC: envString.optional(),
  ADMIN_NTFY_URL: envUrl.optional(),
  ADMIN_TELEGRAM_CHAT_IDS: envCsv.default([]),
  DATABASE_HOST: envString,
  DATABASE_NAME: envString,
  DATABASE_PASSWORD: envString,
  DATABASE_PORT: envNumber.default(5432),
  DATABASE_USER: envString,
  HOST: envString.default('0.0.0.0'),
  INTERNAL_API_TOKEN: envString,
  MAX_PENDING_VAT_NUMBERS_PER_USER: envNumber.default(10),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  NOTIFY_ADMIN_ON_UNRECOVERABLE_ERRORS: envBoolean.default(false),
  PORT: envNumber.default(8080),
  TG_ADMIN_CHAT_ID: envString.optional(),
  TG_BOT_TOKEN: envString,
  TG_POLLING_ENABLED: envBoolean.default(true),
  TG_POLLING_INTERVAL_MS: envNumber.default(1000),
  VAT_NUMBER_EXPIRATION_DAYS: envNumber.default(90),
  VIES_URL: envUrl
});

const AdminWebEnvSchema = z.object({
  ADMIN_BACKEND_URL: envUrl,
  HOST: envString.default('0.0.0.0'),
  INTERNAL_API_TOKEN: envString,
  PORT: envNumber.default(8081)
});

const DatabaseEnvSchema = z.object({
  DATABASE_HOST: envString,
  DATABASE_NAME: envString,
  DATABASE_PASSWORD: envString,
  DATABASE_PORT: envNumber.default(5432),
  DATABASE_USER: envString
});

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
    host: string;
    name: string;
    password: string;
    port: number;
    user: string;
  };
  http: {
    host: string;
    port: number;
  };
  internalApi: {
    token: string;
  };
  nodeEnv: 'development' | 'test' | 'production';
  telegram: {
    botToken: string;
    pollingIntervalMs: number;
    pollingEnabled: boolean;
  };
  vatNumbers: {
    expirationDays: number;
    maxPendingPerUser: number;
  };
  vies: {
    url: string;
  };
};

export type DatabaseConfig = BackendConfig['database'];

export type AdminWebConfig = {
  backend: {
    url: string;
  };
  http: {
    host: string;
    port: number;
  };
  internalApi: {
    token: string;
  };
};

export function parseDatabaseConfig(env: Env = process.env): DatabaseConfig {
  const preparedEnv = resolveSecretFiles(env, {
    DATABASE_PASSWORD: 'DATABASE_PASSWORD_FILE'
  });

  const parsed = DatabaseEnvSchema.safeParse(preparedEnv);

  if (!parsed.success) {
    throw new Error(formatConfigError(parsed.error));
  }

  return {
    host: parsed.data.DATABASE_HOST,
    name: parsed.data.DATABASE_NAME,
    password: parsed.data.DATABASE_PASSWORD,
    port: parsed.data.DATABASE_PORT,
    user: parsed.data.DATABASE_USER
  };
}

export function parseBackendConfig(env: Env = process.env): BackendConfig {
  const preparedEnv = resolveSecretFiles(env, {
    ADMIN_NTFY_TOKEN: 'ADMIN_NTFY_TOKEN_FILE',
    DATABASE_PASSWORD: 'DATABASE_PASSWORD_FILE',
    INTERNAL_API_TOKEN: 'INTERNAL_API_TOKEN_FILE',
    TG_BOT_TOKEN: 'TG_BOT_TOKEN_FILE'
  });

  const parsed = BackendEnvSchema.safeParse(preparedEnv);

  if (!parsed.success) {
    throw new Error(formatConfigError(parsed.error));
  }

  return {
    adminNotifications: parseAdminNotificationConfig(parsed.data),
    database: {
      host: parsed.data.DATABASE_HOST,
      name: parsed.data.DATABASE_NAME,
      password: parsed.data.DATABASE_PASSWORD,
      port: parsed.data.DATABASE_PORT,
      user: parsed.data.DATABASE_USER
    },
    http: {
      host: parsed.data.HOST,
      port: parsed.data.PORT
    },
    internalApi: {
      token: parsed.data.INTERNAL_API_TOKEN
    },
    nodeEnv: parsed.data.NODE_ENV,
    telegram: {
      botToken: parsed.data.TG_BOT_TOKEN,
      pollingIntervalMs: parsed.data.TG_POLLING_INTERVAL_MS,
      pollingEnabled: parsed.data.TG_POLLING_ENABLED
    },
    vatNumbers: {
      expirationDays: parsed.data.VAT_NUMBER_EXPIRATION_DAYS,
      maxPendingPerUser: parsed.data.MAX_PENDING_VAT_NUMBERS_PER_USER
    },
    vies: {
      url: parsed.data.VIES_URL
    }
  };
}

export function parseAdminWebConfig(env: Env = process.env): AdminWebConfig {
  const preparedEnv = resolveSecretFiles(env, {
    INTERNAL_API_TOKEN: 'INTERNAL_API_TOKEN_FILE'
  });

  const parsed = AdminWebEnvSchema.safeParse(preparedEnv);

  if (!parsed.success) {
    throw new Error(formatConfigError(parsed.error));
  }

  return {
    backend: {
      url: parsed.data.ADMIN_BACKEND_URL
    },
    http: {
      host: parsed.data.HOST,
      port: parsed.data.PORT
    },
    internalApi: {
      token: parsed.data.INTERNAL_API_TOKEN
    }
  };
}

type ParsedBackendEnv = z.infer<typeof BackendEnvSchema>;

function parseAdminNotificationConfig(env: ParsedBackendEnv) {
  const explicitChannels: AdminNotificationChannel[] =
    env.ADMIN_NOTIFICATION_CHANNELS.map((channel) =>
      AdminNotificationChannelSchema.parse(channel)
    );
  const legacyTelegramEnabled =
    explicitChannels.length === 0 &&
    env.NOTIFY_ADMIN_ON_UNRECOVERABLE_ERRORS &&
    Boolean(env.TG_ADMIN_CHAT_ID);
  const channels: AdminNotificationChannel[] = legacyTelegramEnabled
    ? ['telegram']
    : explicitChannels;
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

function resolveSecretFiles(
  env: Env,
  fileFallbacks: Record<string, string>
): Env {
  const result = { ...env };

  for (const [valueName, fileName] of Object.entries(fileFallbacks)) {
    if (result[valueName]) {
      continue;
    }

    const filePath = result[fileName];
    if (!filePath) {
      continue;
    }

    result[valueName] = readFileSync(filePath, 'utf8').trim();
  }

  return result;
}

function formatConfigError(error: z.ZodError): string {
  const variables = error.issues.map((issue) => issue.path.join('.'));
  return `Invalid configuration: ${variables.join(', ')}`;
}
