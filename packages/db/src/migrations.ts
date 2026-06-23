import { sql } from 'drizzle-orm';
import { migrate as drizzleMigrate } from 'drizzle-orm/postgres-js/migrator';
import type { Database } from './client';

export interface GeneratedMigrationConfig {
  migrationsFolder: string;
}

export async function migrateGeneratedDatabase(
  db: Database,
  config: GeneratedMigrationConfig
) {
  await drizzleMigrate(db, config);
}

export async function grantRuntimeDatabasePrivileges(
  db: Database,
  runtimeUser: string
) {
  const runtimeRole = sql.raw(quoteIdentifier(runtimeUser));

  await db.execute(
    sql`grant select, insert, update, delete on all tables in schema public to ${runtimeRole}`
  );
  await db.execute(
    sql`grant usage, select on all sequences in schema public to ${runtimeRole}`
  );
  await db.execute(
    sql`alter default privileges in schema public grant select, insert, update, delete on tables to ${runtimeRole}`
  );
  await db.execute(
    sql`alter default privileges in schema public grant usage, select on sequences to ${runtimeRole}`
  );
}

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

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}
