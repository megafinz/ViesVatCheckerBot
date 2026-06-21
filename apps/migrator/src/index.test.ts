import { expect, test } from 'bun:test';
import { startMigrator } from './index';

test('migrator skeleton exposes startup label', () => {
  expect(startMigrator()).toBe('viesvatchecker migrator');
});
