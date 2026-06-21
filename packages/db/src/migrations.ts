import { sql } from 'drizzle-orm';
import type { Database } from './client';

export async function migrateDatabase(db: Database) {
  await db.execute(sql`create extension if not exists "pgcrypto"`);
  await db.execute(sql`
    create table if not exists vat_requests (
      id uuid primary key default gen_random_uuid(),
      telegram_chat_id text not null,
      country_code text not null,
      vat_number text not null,
      expiration_date timestamptz not null
    )
  `);
  await db.execute(sql`
    create unique index if not exists vat_requests_chat_country_number_unique
      on vat_requests (telegram_chat_id, country_code, vat_number)
  `);
  await db.execute(sql`
    create index if not exists vat_requests_telegram_chat_id_idx
      on vat_requests (telegram_chat_id)
  `);
  await db.execute(sql`
    create table if not exists vat_request_errors (
      id uuid primary key default gen_random_uuid(),
      telegram_chat_id text not null,
      country_code text not null,
      vat_number text not null,
      expiration_date timestamptz not null,
      error text not null
    )
  `);
  await db.execute(sql`
    create index if not exists vat_request_errors_request_idx
      on vat_request_errors (telegram_chat_id, country_code, vat_number)
  `);
}

export async function resetDatabase(db: Database) {
  await db.execute(sql`drop table if exists vat_request_errors`);
  await db.execute(sql`drop table if exists vat_requests`);
}
