import type { BackendConfig } from '@viesvatchecker/config';

export function buildDatabaseUrl(config: BackendConfig['database']): string {
  const user = encodeURIComponent(config.user);
  const password = encodeURIComponent(config.password);
  return `postgres://${user}:${password}@${config.host}:${config.port}/${config.name}`;
}
