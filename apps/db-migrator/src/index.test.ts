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
    migrate: async (db) => {
      calls.push(`migrate:${db.id}`);
    }
  });

  expect(result).toEqual({ type: 'migrated' });
  expect(calls).toEqual([
    'create:postgres://user:password@db:5432/viesvatchecker',
    'migrate:db',
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
      migrate: async () => {
        throw new Error('migration failed');
      }
    })
  ).rejects.toThrow('migration failed');

  expect(calls).toEqual(['close']);
});

test('startDbMigrator builds a database URL from database-only environment', async () => {
  const urls: string[] = [];

  await startDbMigrator(
    {
      DATABASE_HOST: 'db',
      DATABASE_NAME: 'viesvatchecker',
      DATABASE_PASSWORD: 'secret',
      DATABASE_PORT: '5432',
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
      migrate: async () => {}
    }
  );

  expect(urls).toEqual(['postgres://migrator:secret@db:5432/viesvatchecker']);
});
