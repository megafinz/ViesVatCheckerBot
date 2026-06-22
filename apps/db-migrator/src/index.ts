import { buildDatabaseUrl } from '@viesvatchecker/adapters';
import { parseDatabaseConfig } from '@viesvatchecker/config';
import { createPostgresClient, migrateDatabase } from '@viesvatchecker/db';

interface MigratorClient<Db> {
  close(): Promise<void> | void;
  db: Db;
}

export interface DbMigratorOptions<Db> {
  createClient(databaseUrl: string): MigratorClient<Db>;
  databaseUrl: string;
  migrate(db: Db): Promise<void>;
}

export type DbMigratorResult = {
  type: 'migrated';
};

export async function runDbMigrator<Db>(
  options: DbMigratorOptions<Db>
): Promise<DbMigratorResult> {
  const client = options.createClient(options.databaseUrl);

  try {
    await options.migrate(client.db);
    return { type: 'migrated' };
  } finally {
    await client.close();
  }
}

export type StartDbMigratorDependencies<Db> = Pick<
  DbMigratorOptions<Db>,
  'createClient' | 'migrate'
>;

export async function startDbMigrator(
  env?: NodeJS.ProcessEnv
): Promise<DbMigratorResult>;
export async function startDbMigrator<Db>(
  env: NodeJS.ProcessEnv,
  deps: StartDbMigratorDependencies<Db>
): Promise<DbMigratorResult>;
export async function startDbMigrator<Db>(
  env: NodeJS.ProcessEnv = process.env,
  deps?: StartDbMigratorDependencies<Db>
): Promise<DbMigratorResult> {
  const database = parseDatabaseConfig(env);
  const databaseUrl = buildDatabaseUrl(database);

  if (deps) {
    return await runDbMigrator({
      createClient: deps.createClient,
      databaseUrl,
      migrate: deps.migrate
    });
  }

  return await runDbMigrator({
    createClient: (url) => createPostgresClient({ url }),
    databaseUrl,
    migrate: migrateDatabase
  });
}

if (import.meta.main) {
  await startDbMigrator();
}
