import { describe, expect, test } from 'bun:test';
import { parseMigratorArgs } from './cli';

describe('parseMigratorArgs', () => {
  test('parses supported modes', () => {
    expect(parseMigratorArgs(['--verify'])).toEqual({ mode: 'verify' });
    expect(parseMigratorArgs(['--dry-run'])).toEqual({ mode: 'dry-run' });
    expect(parseMigratorArgs(['--migrate'])).toEqual({ mode: 'migrate' });
  });

  test('requires exactly one mode', () => {
    expect(() => parseMigratorArgs([])).toThrow(
      'Choose exactly one migrator mode: --verify, --dry-run, or --migrate.'
    );
    expect(() => parseMigratorArgs(['--verify', '--migrate'])).toThrow(
      'Choose exactly one migrator mode: --verify, --dry-run, or --migrate.'
    );
  });
});
