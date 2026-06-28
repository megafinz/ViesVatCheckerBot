import { randomUUID } from 'node:crypto';

export interface ComposeSmokeStep {
  args: string[];
  name: string;
}

export function buildComposeSmokeEnvironment(
  projectName = `vies-smoke-${Date.now()}`
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ADMIN_WEB_PUBLISHED_PORT: '0',
    COMPOSE_PROJECT_NAME: projectName,
    DATABASE_MIGRATOR_PASSWORD: `migrator-${randomUUID()}`,
    DATABASE_NAME: 'viesvatchecker',
    DATABASE_PUBLISHED_PORT: '0',
    DATABASE_RUNTIME_PASSWORD: `runtime-${randomUUID()}`,
    DATABASE_SUPERUSER_PASSWORD: `superuser-${randomUUID()}`,
    HTTP_PUBLISHED_PORT: '0',
    INTERNAL_API_TOKEN: `internal-${randomUUID()}`,
    TG_ADMIN_CHAT_ID: '0',
    TG_BOT_TOKEN: 'compose-smoke-token',
    TG_POLLING_ENABLED: 'false'
  };
}

export function buildComposeSmokePlan(projectName: string): ComposeSmokeStep[] {
  const baseArgs = [
    'compose',
    '--profile',
    'admin',
    '--project-name',
    projectName
  ];

  return [
    {
      args: [...baseArgs, 'build', 'db-migrator', 'backend', 'admin-web'],
      name: 'build images'
    },
    {
      args: [...baseArgs, 'up', '-d', 'db'],
      name: 'start database'
    },
    {
      args: [...baseArgs, 'run', '--rm', 'db-migrator'],
      name: 'run migrations'
    },
    {
      args: [...baseArgs, 'up', '-d', 'backend', 'admin-web'],
      name: 'start runtime services'
    },
    {
      args: [...baseArgs, 'port', 'backend', '8080'],
      name: 'read backend port'
    },
    {
      args: [...baseArgs, 'port', 'admin-web', '8081'],
      name: 'read admin web port'
    }
  ];
}

export async function runComposeSmoke() {
  const projectName = `vies-smoke-${Date.now()}`;
  const env = buildComposeSmokeEnvironment(projectName);
  const plan = buildComposeSmokePlan(projectName);

  try {
    for (const step of plan.slice(0, 4)) {
      await runCommand('docker', step.args, env, step.name);
    }

    const backendPort = parsePublishedPort(
      await runCommand('docker', plan[4].args, env, plan[4].name)
    );
    const adminWebPort = parsePublishedPort(
      await runCommand('docker', plan[5].args, env, plan[5].name)
    );

    await waitForText(
      `http://127.0.0.1:${backendPort}/health`,
      '"ok":true',
      'backend health'
    );
    await waitForText(
      `http://127.0.0.1:${adminWebPort}/`,
      '<div id="root"></div>',
      'admin web shell'
    );
    await waitForText(
      `http://127.0.0.1:${adminWebPort}/api/health`,
      '"ok":true',
      'admin web health proxy'
    );
  } finally {
    await runCommand(
      'docker',
      [
        'compose',
        '--profile',
        'admin',
        '--project-name',
        projectName,
        'down',
        '--volumes',
        '--remove-orphans'
      ],
      env,
      'cleanup',
      { allowFailure: true }
    );
  }
}

async function waitForText(url: string, expected: string, label: string) {
  const deadline = Date.now() + 60_000;
  let lastError = '';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      if (response.ok && text.includes(expected)) {
        return;
      }
      lastError = `${response.status} ${text.slice(0, 200)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await Bun.sleep(1000);
  }

  throw new Error(`${label} did not become ready: ${lastError}`);
}

async function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  label: string,
  options: { allowFailure?: boolean } = {}
): Promise<string> {
  const child = Bun.spawn([command, ...args], {
    env,
    stderr: 'pipe',
    stdout: 'pipe'
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text()
  ]);

  if (exitCode !== 0 && !options.allowFailure) {
    throw new Error(
      `${label} failed with exit code ${exitCode}\n${stdout}\n${stderr}`.trim()
    );
  }

  return stdout.trim();
}

function parsePublishedPort(output: string): number {
  const port = Number(output.split(':').at(-1));
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Could not parse published port from: ${output}`);
  }

  return port;
}

if (import.meta.main) {
  await runComposeSmoke();
}
