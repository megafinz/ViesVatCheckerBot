import { parseAdminWebConfig } from '@viesvatchecker/config';
import { createAdminWebApp } from './app';

type AdminWebApp = ReturnType<typeof createAdminWebApp>;

interface AdminWebServer {
  stop(): Promise<unknown> | unknown;
}

export interface StartAdminWebDependencies {
  listen(
    app: AdminWebApp,
    options: { hostname: string; port: number }
  ): AdminWebServer;
}

const defaultStartAdminWebDependencies: StartAdminWebDependencies = {
  listen: (app, options) => app.listen(options)
};

export async function startAdminWeb(
  env: NodeJS.ProcessEnv = process.env,
  deps: StartAdminWebDependencies = defaultStartAdminWebDependencies
) {
  const config = parseAdminWebConfig(env);
  const app = createAdminWebApp({
    backendUrl: config.backend.url,
    fetch,
    internalApiToken: config.internalApi.token
  });
  const server = deps.listen(app, {
    hostname: config.http.host,
    port: config.http.port
  });

  return {
    app,
    stop: async () => {
      await server.stop();
    }
  };
}

if (import.meta.main) {
  await startAdminWeb();
}
