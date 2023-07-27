import { z } from 'zod';

const CfgSchema = z.object({
  db: z.object({
    connectionString: z.string()
  }),
  vies: z.object({
    url: z.string().url()
  }),
  tg: z.object({
    botToken: z.string()
  }),
  api: z.object({
    azure: z.object({
      tg: z.object({
        url: z.string().url(), // URL of TgBotApi function
        authToken: z.string() // auth code of TgBotApi function
      }),
      http: z.object({
        url: z.string().url(), // URL of HttpApi function
        authToken: z.string() // auth code of HttpApi function
      })
    })
  }),
  admin: z.object({
    notifyOnUnrecoverableErrors: z
      .string()
      .default('false')
      .pipe(z.coerce.boolean().default(false)),
    tgChatId: z.string().optional()
  }),
  vatNumbers: z.object({
    expirationDays: z
      .string()
      .default('90')
      .pipe(z.coerce.number().default(90)),
    maxPendingPerUser: z
      .string()
      .default('10')
      .pipe(z.coerce.number().default(10))
  })
});

const rawEnvCfg = {
  db: {
    connectionString: process.env.MONGODB_CONNECTION_STRING
  },
  vies: {
    url: process.env.VIES_URL
  },
  tg: {
    botToken: process.env.TG_BOT_TOKEN
  },
  api: {
    azure: {
      tg: {
        url: process.env.TG_BOT_API_URL,
        authToken: process.env.TG_BOT_API_TOKEN
      },
      http: {
        url: process.env.HTTP_API_URL,
        authToken: process.env.HTTP_API_TOKEN
      }
    }
  },
  admin: {
    notifyOnUnrecoverableErrors:
      process.env.NOTIFY_ADMIN_ON_UNRECOVERABLE_ERRORS,
    tgChatId: process.env.TG_ADMIN_CHAT_ID
  },
  vatNumbers: {
    expirationDays: process.env.VAT_NUMBER_EXPIRATION_DAYS,
    maxPendingPerUser: process.env.MAX_PENDING_VAT_NUMBERS_PER_USER
  }
};

export type Cfg = z.infer<typeof CfgSchema>;

export const cfg = CfgSchema.parse(rawEnvCfg);
