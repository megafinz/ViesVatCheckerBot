# Self-Hosting

This repo can run as a private, self-hosted service without a public domain. Telegram updates are received through long polling, so Telegram does not need to call back into your network with a webhook.

The durable runtime is:

- `db`: PostgreSQL for VAT requests and processing errors.
- `db-migrator`: one-shot Bun service that applies database migrations.
- `backend`: Bun HTTP service plus Telegram polling loop.
- `admin-web`: optional internal admin web service.
- `pending-vat-worker`: one-shot job that checks pending VAT numbers.
- `pending-vat-worker-cron`: cron wrapper that runs the pending VAT worker on a schedule.

## Requirements

- Docker with Docker Compose.
- A Telegram bot token from BotFather.
- A long random value for `INTERNAL_API_TOKEN`.

## Configuration

Create a local `.env` from the example:

```sh
cp .env.example .env
```

At minimum, set:

```sh
TG_BOT_TOKEN=your-telegram-bot-token
INTERNAL_API_TOKEN=replace-with-a-long-random-secret
DATABASE_SUPERUSER_PASSWORD=replace-with-a-superuser-password
DATABASE_MIGRATOR_PASSWORD=replace-with-a-migrator-password
DATABASE_RUNTIME_PASSWORD=replace-with-a-runtime-password
```

For container secret stores, you can set file variables instead of direct secret values:

```sh
TG_BOT_TOKEN_FILE=/run/secrets/tg_bot_token
INTERNAL_API_TOKEN_FILE=/run/secrets/internal_api_token
DATABASE_SUPERUSER_PASSWORD_FILE=/run/secrets/db_superuser_password
DATABASE_MIGRATOR_PASSWORD_FILE=/run/secrets/db_migrator_password
DATABASE_RUNTIME_PASSWORD_FILE=/run/secrets/db_runtime_password
```

Mount those files into the relevant containers from your private deployment repo. Direct values take precedence when both forms are set.

Useful options:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HTTP_PUBLISHED_PORT` | `8080` | Host port for the backend health/API server. |
| `ADMIN_WEB_PUBLISHED_PORT` | `8081` | Host port for the optional internal admin web service. |
| `ADMIN_BACKEND_URL` | `http://127.0.0.1:8080` | Backend URL used by local admin web development. Compose sets this to the backend service URL. |
| `DATABASE_PUBLISHED_PORT` | `54329` | Host port for PostgreSQL. Set only if you need host access. |
| `DATABASE_SUPERUSER` | `viesvatchecker_superadmin` | PostgreSQL bootstrap owner used by the database container. |
| `DATABASE_MIGRATOR_USER` | `viesvatchecker_migrator` | Role used by `db-migrator` to apply schema changes. |
| `DATABASE_RUNTIME_USER` | `viesvatchecker_runtime` | Lower-privilege role used by backend and worker services. |
| `*_FILE` secrets | empty | Optional file paths for Telegram, internal API, and database passwords. |
| `TG_POLLING_ENABLED` | `true` | Enables Telegram long polling in the backend. |
| `TG_POLLING_INTERVAL_MS` | `1000` | Delay between polling cycles. |
| `PENDING_VAT_WORKER_CRON` | `0 * * * *` | Cron schedule for pending VAT checks. |
| `TG_ADMIN_CHAT_ID` | empty | Optional Telegram chat for admin notifications. |
| `NOTIFY_ADMIN_ON_UNRECOVERABLE_ERRORS` | `false` | Sends admin notifications for unrecoverable worker errors when enabled. |
| `MAX_PENDING_VAT_NUMBERS_PER_USER` | `10` | Per-user pending VAT limit. |
| `VAT_NUMBER_EXPIRATION_DAYS` | `90` | Days before a pending VAT number expires. |
| `VIES_URL` | EU VIES WSDL URL | VAT validation endpoint. |

Keep real secrets, hostnames, and deployment-specific overrides in `.env` or a private deployment repo. Do not commit them to this public repository.

## Start The Service

Build and start PostgreSQL:

```sh
docker compose up -d db
```

Apply database migrations:

```sh
docker compose run --rm db-migrator
```

The migrator also grants runtime table and sequence privileges to `DATABASE_RUNTIME_USER` after applying schema changes.

Start the backend:

```sh
docker compose up -d backend
```

Start the optional admin web service:

```sh
docker compose --profile admin up -d admin-web
```

Check backend health:

```sh
curl http://localhost:${HTTP_PUBLISHED_PORT:-8080}/health
```

Follow logs:

```sh
docker compose logs -f backend
```

## Run Pending VAT Checks

For a persistent scheduler:

```sh
docker compose --profile scheduler up -d pending-vat-worker-cron
```

For a one-off run:

```sh
docker compose --profile jobs run --rm pending-vat-worker
```

The default schedule runs once per hour at the top of the hour. Change `PENDING_VAT_WORKER_CRON` in `.env` to adjust it.

## Update

After pulling new code:

```sh
docker compose build db-migrator backend pending-vat-worker
docker compose up -d db
docker compose run --rm db-migrator
docker compose up -d backend
docker compose --profile admin up -d admin-web
docker compose --profile scheduler up -d pending-vat-worker-cron
```

## Database Schema Changes

After changing `packages/db/src/schema.ts`, generate a migration:

```sh
bun run db:generate
```

Commit the generated files under `packages/db/drizzle`, then apply them with the DB migrator:

```sh
docker compose run --rm db-migrator
```

## Backups

Create a database backup before upgrades or maintenance:

```sh
docker compose exec db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql
```

Restore into an empty database:

```sh
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < backup.sql
```

## Operations

Stop the app while keeping database data:

```sh
docker compose down
```

Stop the app and remove database data:

```sh
docker compose down --volumes
```

Use `docker compose ps` to inspect service status.
