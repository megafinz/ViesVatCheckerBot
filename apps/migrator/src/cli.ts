import type { MigrationMode } from './types';

const modeFlags: Record<string, MigrationMode> = {
  '--dry-run': 'dry-run',
  '--migrate': 'migrate',
  '--verify': 'verify'
};

export function parseMigratorArgs(args: string[]) {
  const modes = args
    .filter((arg) => arg in modeFlags)
    .map((arg) => modeFlags[arg]);

  if (modes.length !== 1) {
    throw new Error(
      'Choose exactly one migrator mode: --verify, --dry-run, or --migrate.'
    );
  }

  return { mode: modes[0] };
}
