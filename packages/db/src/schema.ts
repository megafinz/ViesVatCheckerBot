import { relations } from 'drizzle-orm';
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';

export const vatRequests = pgTable(
  'vat_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    telegramChatId: text('telegram_chat_id').notNull(),
    countryCode: text('country_code').notNull(),
    vatNumber: text('vat_number').notNull(),
    expirationDate: timestamp('expiration_date', {
      mode: 'date',
      withTimezone: true
    }).notNull()
  },
  (table) => [
    uniqueIndex('vat_requests_chat_country_number_unique').on(
      table.telegramChatId,
      table.countryCode,
      table.vatNumber
    ),
    index('vat_requests_telegram_chat_id_idx').on(table.telegramChatId)
  ]
);

export const vatRequestErrors = pgTable(
  'vat_request_errors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    telegramChatId: text('telegram_chat_id').notNull(),
    countryCode: text('country_code').notNull(),
    vatNumber: text('vat_number').notNull(),
    expirationDate: timestamp('expiration_date', {
      mode: 'date',
      withTimezone: true
    }).notNull(),
    error: text('error').notNull()
  },
  (table) => [
    index('vat_request_errors_request_idx').on(
      table.telegramChatId,
      table.countryCode,
      table.vatNumber
    )
  ]
);

export const vatRequestErrorsRelations = relations(
  vatRequestErrors,
  () => ({})
);

export const schema = {
  vatRequestErrors,
  vatRequestErrorsRelations,
  vatRequests
};

export type VatRequestRow = typeof vatRequests.$inferSelect;
export type NewVatRequestRow = typeof vatRequests.$inferInsert;
export type VatRequestErrorRow = typeof vatRequestErrors.$inferSelect;
export type NewVatRequestErrorRow = typeof vatRequestErrors.$inferInsert;
