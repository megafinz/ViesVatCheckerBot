import { expect, test } from 'bun:test';
import { configPackageName } from './index';

test('config package exports its package name', () => {
  expect(configPackageName).toBe('@viesvatchecker/config');
});
