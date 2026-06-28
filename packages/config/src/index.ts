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

const HttpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive()
});

const InternalApiConfigSchema = z.object({
  token: z.string().min(1)
});

const DatabaseConfigSchema = z.object({
  host: z.string().min(1),
  name: z.string().min(1),
  password: z.string().min(1),
  port: z.number().int().positive(),
  user: z.string().min(1)
});

const TelegramConfigSchema = z.object({
  botToken: z.string().min(1),
  pollingEnabled: z.boolean(),
  pollingIntervalMs: z.number().int().positive()
});

const VatNumbersConfigSchema = z.object({
  expirationDays: z.number().int().positive(),
  maxPendingPerUser: z.number().int().positive()
});

const ViesConfigSchema = z.object({
  url: z.url()
});

const AdminTelegramConfigSchema = z.object({
  chatIds: z.array(z.string().min(1))
});

const AdminNtfyConfigSchema = z.object({
  token: z.string().min(1).optional(),
  topic: z.string().min(1).optional(),
  url: z.url().optional()
});

const AdminNotificationsConfigSchema = z.object({
  channels: z.array(AdminNotificationChannelSchema),
  ntfy: AdminNtfyConfigSchema,
  telegram: AdminTelegramConfigSchema
});

const BackendConfigSchema = z.object({
  adminNotifications: AdminNotificationsConfigSchema,
  database: DatabaseConfigSchema,
  http: HttpConfigSchema,
  internalApi: InternalApiConfigSchema,
  nodeEnv: NodeEnvSchema,
  telegram: TelegramConfigSchema,
  vatNumbers: VatNumbersConfigSchema,
  vies: ViesConfigSchema
});

const AdminWebBackendConfigSchema = z.object({
  url: z.url()
});

const AdminWebConfigSchema = z.object({
  backend: AdminWebBackendConfigSchema,
  http: HttpConfigSchema,
  internalApi: InternalApiConfigSchema
});

function buildBackendConfig(
  env: z.infer<typeof BackendEnvSchema>
): z.infer<typeof BackendConfigSchema> {
  const explicitChannels: z.infer<typeof AdminNotificationChannelSchema>[] =
    env.ADMIN_NOTIFICATION_CHANNELS.map((channel) =>
      AdminNotificationChannelSchema.parse(channel)
    );
  const legacyTelegramEnabled =
    explicitChannels.length === 0 &&
    env.NOTIFY_ADMIN_ON_UNRECOVERABLE_ERRORS &&
    Boolean(env.TG_ADMIN_CHAT_ID);
  const channels: z.infer<typeof AdminNotificationChannelSchema>[] =
    legacyTelegramEnabled ? ['telegram'] : explicitChannels;
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

  return BackendConfigSchema.parse({
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
  });
}

export type AdminNotificationChannel = z.infer<
  typeof AdminNotificationChannelSchema
>;

export type BackendConfig = z.infer<typeof BackendConfigSchema>;

export type DatabaseConfig = BackendConfig['database'];

export type AdminWebConfig = z.infer<typeof AdminWebConfigSchema>;

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

  const parsedEnv = BackendEnvSchema.safeParse(preparedEnv);

  if (!parsedEnv.success) {
    throw new Error(formatConfigError(parsedEnv.error));
  }

  return buildBackendConfig(parsedEnv.data);
}

export function parseAdminWebConfig(env: Env = process.env): AdminWebConfig {
  const preparedEnv = resolveSecretFiles(env, {
    INTERNAL_API_TOKEN: 'INTERNAL_API_TOKEN_FILE'
  });

  const parsed = AdminWebEnvSchema.safeParse(preparedEnv);

  if (!parsed.success) {
    throw new Error(formatConfigError(parsed.error));
  }

  return AdminWebConfigSchema.parse({
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
  });
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
