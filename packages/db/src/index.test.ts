import { expect, test } from 'bun:test';
import { dbPackageName } from './index';

test('db package exports its package name', () => {
  expect(dbPackageName).toBe('@viesvatchecker/db');
});
