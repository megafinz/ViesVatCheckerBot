import { afterEach, expect, test } from 'bun:test';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('init-roles reads role passwords from file variables', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vies-postgres-init-'));
  tempDirs.push(dir);

  const binDir = join(dir, 'bin');
  const logFile = join(dir, 'psql.log');
  const migratorPasswordFile = join(dir, 'migrator-password');
  const runtimePasswordFile = join(dir, 'runtime-password');

  mkdirSync(binDir);
  const fakePsql = join(binDir, 'psql');
  writeFileSync(
    fakePsql,
    [
      '#!/usr/bin/env sh',
      'printf "%s\\n" "$*" >> "$PSQL_LOG"',
      'cat >/dev/null',
      ''
    ].join('\n')
  );
  chmodSync(fakePsql, 0o755);
  writeFileSync(migratorPasswordFile, 'migrator-secret\n');
  writeFileSync(runtimePasswordFile, 'runtime-secret\n');

  const child = Bun.spawn(['sh', 'docker/postgres/init-roles.sh'], {
    env: {
      DATABASE_MIGRATOR_PASSWORD_FILE: migratorPasswordFile,
      DATABASE_MIGRATOR_USER: 'viesvatchecker_migrator',
      DATABASE_NAME: 'viesvatchecker',
      DATABASE_RUNTIME_PASSWORD_FILE: runtimePasswordFile,
      DATABASE_RUNTIME_USER: 'viesvatchecker_runtime',
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      POSTGRES_DB: 'viesvatchecker',
      POSTGRES_USER: 'viesvatchecker_superadmin',
      PSQL_LOG: logFile
    },
    stderr: 'pipe',
    stdout: 'pipe'
  });

  const exitCode = await child.exited;
  const stderr = await new Response(child.stderr).text();

  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: '' });
  expect(readFileSync(logFile, 'utf8')).toContain(
    '--set role_password=migrator-secret'
  );
  expect(readFileSync(logFile, 'utf8')).toContain(
    '--set role_password=runtime-secret'
  );
});
