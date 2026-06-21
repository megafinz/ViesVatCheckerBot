import { expect, test } from 'bun:test';
import { buildDatabaseUrl } from './database-url';

test('buildDatabaseUrl builds a postgres URL from backend config fields', () => {
  expect(
    buildDatabaseUrl({
      host: 'db',
      name: 'viesvatchecker',
      password: 'postgres password',
      port: 5432,
      user: 'backend'
    })
  ).toBe('postgres://backend:postgres%20password@db:5432/viesvatchecker');
});
