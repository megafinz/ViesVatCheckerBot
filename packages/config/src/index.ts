import { readFileSync } from 'node:fs';
import { z } from 'zod';

type Env = Record<string, string | undefined>;

const envString = z.string().trim().min(1);
const envUrl = z.url();
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

const NodeEnvSchema = z.enum(['development', 'test', 'production']);

export type AdminNotificationChannel = z.infer<
  typeof AdminNotificationChannelSchema
>;

const BackendConfigSchema = z.object({
  adminNotifications: z.object({
    channels: z.array(AdminNotificationChannelSchema),
    ntfy: z.object({
      token: z.string().min(1).optional(),
      topic: z.string().min(1).optional(),
      url: z.url().optional()
    }),
    telegram: z.object({
      chatIds: z.array(z.string().min(1))
    })
  }),
  database: z.object({
    host: z.string().min(1),
    name: z.string().min(1),
    password: z.string().min(1),
    port: z.number().int().positive(),
    user: z.string().min(1)
  }),
  http: z.object({
    host: z.string().min(1),
    port: z.number().int().positive()
  }),
  internalApi: z.object({
    token: z.string().min(1)
  }),
  nodeEnv: NodeEnvSchema,
  telegram: z.object({
    botToken: z.string().min(1),
    pollingEnabled: z.boolean(),
    pollingIntervalMs: z.number().int().positive()
  }),
  vatNumbers: z.object({
    expirationDays: z.number().int().positive(),
    maxPendingPerUser: z.number().int().positive()
  }),
  vies: z.object({
    url: z.url()
  })
});

export type BackendConfig = z.infer<typeof BackendConfigSchema>;

const AdminWebConfigSchema = z.object({
  backend: z.object({
    url: z.url()
  }),
  http: z.object({
    host: z.string().min(1),
    port: z.number().int().positive()
  }),
  internalApi: z.object({
    token: z.string().min(1)
  })
});

export type AdminWebConfig = z.infer<typeof AdminWebConfigSchema>;

const DatabaseConfigSchema = z.object({
  host: z.string().min(1),
  name: z.string().min(1),
  password: z.string().min(1),
  port: z.number().int().positive(),
  user: z.string().min(1)
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

const BackendEnvObjectSchema = z.object({
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
  NODE_ENV: NodeEnvSchema.default('development'),
  NOTIFY_ADMIN_ON_UNRECOVERABLE_ERRORS: envBoolean.default(false),
  PORT: envNumber.default(8080),
  TG_ADMIN_CHAT_ID: envString.optional(),
  TG_BOT_TOKEN: envString,
  TG_POLLING_ENABLED: envBoolean.default(true),
  TG_POLLING_INTERVAL_MS: envNumber.default(1000),
  VAT_NUMBER_EXPIRATION_DAYS: envNumber.default(90),
  VIES_URL: envUrl
});

const BackendEnvSchema = BackendEnvObjectSchema.transform(
  (env): BackendConfig => toBackendConfig(env)
);

function toBackendConfig(
  env: z.infer<typeof BackendEnvObjectSchema>
): BackendConfig {
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
    adminNotifications: {
      channels,
      ntfy: {
        token: env.ADMIN_NTFY_TOKEN,
        topic: env.ADMIN_NTFY_TOPIC,
        url: env.ADMIN_NTFY_URL
      },
      telegram: {
        chatIds: telegramChatIds
      }
    },
    database: {
      host: env.DATABASE_HOST,
      name: env.DATABASE_NAME,
      password: env.DATABASE_PASSWORD,
      port: env.DATABASE_PORT,
      user: env.DATABASE_USER
    },
    http: {
      host: env.HOST,
      port: env.PORT
    },
    internalApi: {
      token: env.INTERNAL_API_TOKEN
    },
    nodeEnv: env.NODE_ENV,
    telegram: {
      botToken: env.TG_BOT_TOKEN,
      pollingEnabled: env.TG_POLLING_ENABLED,
      pollingIntervalMs: env.TG_POLLING_INTERVAL_MS
    },
    vatNumbers: {
      expirationDays: env.VAT_NUMBER_EXPIRATION_DAYS,
      maxPendingPerUser: env.MAX_PENDING_VAT_NUMBERS_PER_USER
    },
    vies: {
      url: env.VIES_URL
    }
  };
}

const AdminWebEnvObjectSchema = z.object({
  ADMIN_BACKEND_URL: envUrl,
  HOST: envString.default('0.0.0.0'),
  INTERNAL_API_TOKEN: envString,
  PORT: envNumber.default(8081)
});

const AdminWebEnvSchema = AdminWebEnvObjectSchema.transform(
  (env): AdminWebConfig => ({
    backend: {
      url: env.ADMIN_BACKEND_URL
    },
    http: {
      host: env.HOST,
      port: env.PORT
    },
    internalApi: {
      token: env.INTERNAL_API_TOKEN
    }
  })
);

const DatabaseEnvObjectSchema = z.object({
  DATABASE_HOST: envString,
  DATABASE_NAME: envString,
  DATABASE_PASSWORD: envString,
  DATABASE_PORT: envNumber.default(5432),
  DATABASE_USER: envString
});

const DatabaseEnvSchema = DatabaseEnvObjectSchema.transform(
  (env): DatabaseConfig => ({
    host: env.DATABASE_HOST,
    name: env.DATABASE_NAME,
    password: env.DATABASE_PASSWORD,
    port: env.DATABASE_PORT,
    user: env.DATABASE_USER
  })
);

export function parseDatabaseConfig(env: Env = process.env): DatabaseConfig {
  const preparedEnv = resolveSecretFiles(env, {
    DATABASE_PASSWORD: 'DATABASE_PASSWORD_FILE'
  });

  const parsed = DatabaseEnvSchema.safeParse(preparedEnv);

  if (!parsed.success) {
    throw new Error(formatConfigError(parsed.error));
  }

  return parsed.data;
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

  return parsed.data;
}

export function parseAdminWebConfig(env: Env = process.env): AdminWebConfig {
  const preparedEnv = resolveSecretFiles(env, {
    INTERNAL_API_TOKEN: 'INTERNAL_API_TOKEN_FILE'
  });

  const parsed = AdminWebEnvSchema.safeParse(preparedEnv);

  if (!parsed.success) {
    throw new Error(formatConfigError(parsed.error));
  }

  return parsed.data;
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
