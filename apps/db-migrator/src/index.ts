import { buildDatabaseUrl } from '@viesvatchecker/adapters';
import { parseDatabaseConfig } from '@viesvatchecker/config';
import {
  createPostgresClient,
  type GeneratedMigrationConfig,
  grantRuntimeDatabasePrivileges,
  migrateGeneratedDatabase
} from '@viesvatchecker/db';

const sourceMigrationsFolder = new URL(
  '../../../packages/db/drizzle',
  import.meta.url
).pathname;
const bundledMigrationsFolder = new URL('./drizzle', import.meta.url).pathname;

interface MigratorClient<Db> {
  close(): Promise<void> | void;
  db: Db;
}

export interface DbMigratorOptions<Db> {
  createClient(databaseUrl: string): MigratorClient<Db>;
  databaseUrl: string;
  grantRuntimeAccess?(db: Db, runtimeDatabaseUser: string): Promise<void>;
  migrationsFolder?: string;
  migrate(db: Db, config: GeneratedMigrationConfig): Promise<void>;
  runtimeDatabaseUser?: string;
}

export type DbMigratorResult = {
  type: 'migrated';
};

export async function runDbMigrator<Db>(
  options: DbMigratorOptions<Db>
): Promise<DbMigratorResult> {
  const client = options.createClient(options.databaseUrl);
  const migrationsFolder = options.migrationsFolder ?? 'packages/db/drizzle';

  try {
    await options.migrate(client.db, { migrationsFolder });
    if (options.runtimeDatabaseUser) {
      await options.grantRuntimeAccess?.(
        client.db,
        options.runtimeDatabaseUser
      );
    }
    return { type: 'migrated' };
  } finally {
    await client.close();
  }
}

export type StartDbMigratorDependencies<Db> = Pick<
  DbMigratorOptions<Db>,
  'createClient' | 'grantRuntimeAccess' | 'migrate'
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
  const migrationsFolder = resolveDefaultMigrationsFolder();
  const runtimeDatabaseUser = env.DATABASE_RUNTIME_USER?.trim() || undefined;

  if (deps) {
    return await runDbMigrator({
      createClient: deps.createClient,
      databaseUrl,
      grantRuntimeAccess: deps.grantRuntimeAccess,
      migrationsFolder,
      migrate: deps.migrate,
      runtimeDatabaseUser
    });
  }

  return await runDbMigrator({
    createClient: (url) => createPostgresClient({ url }),
    databaseUrl,
    grantRuntimeAccess: grantRuntimeDatabasePrivileges,
    migrationsFolder,
    migrate: migrateGeneratedDatabase,
    runtimeDatabaseUser
  });
}

export function resolveDefaultMigrationsFolder() {
  if (import.meta.dir.endsWith('/apps/db-migrator/src')) {
    return sourceMigrationsFolder;
  }

  return bundledMigrationsFolder;
}

if (import.meta.main) {
  await startDbMigrator();
}
