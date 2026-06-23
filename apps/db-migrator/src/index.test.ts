import { expect, test } from 'bun:test';
import { runDbMigrator, startDbMigrator } from './index';

test('runDbMigrator applies migrations with the provided database client', async () => {
  const calls: string[] = [];
  const client = {
    db: { id: 'db' },
    close: async () => {
      calls.push('close');
    }
  };

  const result = await runDbMigrator({
    createClient: (url) => {
      calls.push(`create:${url}`);
      return client;
    },
    databaseUrl: 'postgres://user:password@db:5432/viesvatchecker',
    migrate: async (db, config) => {
      calls.push(`migrate:${db.id}:${config.migrationsFolder}`);
    }
  });

  expect(result).toEqual({ type: 'migrated' });
  expect(calls).toEqual([
    'create:postgres://user:password@db:5432/viesvatchecker',
    'migrate:db:packages/db/drizzle',
    'close'
  ]);
});

test('runDbMigrator grants runtime database privileges after migrations', async () => {
  const calls: string[] = [];

  await runDbMigrator({
    createClient: () => ({
      db: { id: 'db' },
      close: async () => {
        calls.push('close');
      }
    }),
    databaseUrl: 'postgres://migrator:password@db:5432/viesvatchecker',
    grantRuntimeAccess: async (db, runtimeUser) => {
      calls.push(`grant:${db.id}:${runtimeUser}`);
    },
    migrate: async (db) => {
      calls.push(`migrate:${db.id}`);
    },
    runtimeDatabaseUser: 'viesvatchecker_runtime'
  });

  expect(calls).toEqual([
    'migrate:db',
    'grant:db:viesvatchecker_runtime',
    'close'
  ]);
});

test('runDbMigrator closes the database client when migration fails', async () => {
  const calls: string[] = [];
  const client = {
    db: { id: 'db' },
    close: async () => {
      calls.push('close');
    }
  };

  await expect(
    runDbMigrator({
      createClient: () => client,
      databaseUrl: 'postgres://user:password@db:5432/viesvatchecker',
      migrationsFolder: 'packages/db/drizzle',
      migrate: async () => {
        throw new Error('migration failed');
      }
    })
  ).rejects.toThrow('migration failed');

  expect(calls).toEqual(['close']);
});

test('startDbMigrator builds a database URL from database-only environment', async () => {
  const urls: string[] = [];
  const migrationFolders: string[] = [];
  const runtimeUsers: string[] = [];

  await startDbMigrator(
    {
      DATABASE_HOST: 'db',
      DATABASE_NAME: 'viesvatchecker',
      DATABASE_PASSWORD: 'secret',
      DATABASE_PORT: '5432',
      DATABASE_RUNTIME_USER: 'runtime',
      DATABASE_USER: 'migrator'
    },
    {
      createClient: (url) => {
        urls.push(url);
        return {
          db: {},
          close: async () => {}
        };
      },
      grantRuntimeAccess: async (_db, runtimeUser) => {
        runtimeUsers.push(runtimeUser);
      },
      migrate: async (_db, config) => {
        migrationFolders.push(config.migrationsFolder);
      }
    }
  );

  expect(urls).toEqual(['postgres://migrator:secret@db:5432/viesvatchecker']);
  expect(migrationFolders[0]).toEndWith('packages/db/drizzle');
  expect(runtimeUsers).toEqual(['runtime']);
});
