import {
  createPostgresClient,
  createVatRequestErrorRepository,
  createVatRequestRepository,
  migrateDatabase
} from '@viesvatchecker/db';
import { MongoClient } from 'mongodb';
import { parseMigratorArgs } from './cli';
import { migrateVatData } from './migrate';
import { createMongoMigrationSource } from './mongo-source';
import { createPostgresMigrationTarget } from './postgres-target';

export async function runMigrator(args = Bun.argv.slice(2), env = process.env) {
  const { mode } = parseMigratorArgs(args);
  const mongoConnectionString = readRequiredEnv(
    env,
    'MONGODB_CONNECTION_STRING'
  );
  const databaseUrl = readRequiredEnv(env, 'DATABASE_URL');

  const mongoClient = new MongoClient(mongoConnectionString);
  const postgresClient = createPostgresClient({ url: databaseUrl });

  try {
    await mongoClient.connect();
    await migrateDatabase(postgresClient.db);

    const result = await migrateVatData({
      mode,
      source: createMongoMigrationSource(mongoClient.db()),
      target: createPostgresMigrationTarget({
        vatRequests: createVatRequestRepository(postgresClient.db),
        vatRequestErrors: createVatRequestErrorRepository(postgresClient.db)
      })
    });

    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    await Promise.all([mongoClient.close(), postgresClient.close()]);
  }
}

export function readRequiredEnv(
  env: Record<string, string | undefined>,
  name: string
) {
  const value = env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

if (import.meta.main) {
  await runMigrator();
}
