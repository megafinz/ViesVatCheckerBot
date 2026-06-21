import { expect, test } from 'bun:test';
import { corePackageName } from './index';

test('core package exports its package name', () => {
  expect(corePackageName).toBe('@viesvatchecker/core');
});
