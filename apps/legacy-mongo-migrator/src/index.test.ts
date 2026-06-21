import { expect, test } from 'bun:test';
import { readRequiredEnv } from './index';

test('readRequiredEnv returns a non-empty environment value', () => {
  expect(
    readRequiredEnv({ DATABASE_URL: 'postgres://example' }, 'DATABASE_URL')
  ).toBe('postgres://example');
});

test('readRequiredEnv fails with the missing variable name', () => {
  expect(() => readRequiredEnv({}, 'DATABASE_URL')).toThrow(
    'Missing required environment variable: DATABASE_URL'
  );
});
