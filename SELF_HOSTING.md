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

## Configuration

Create a local `.env` from the example:

```sh
cp .env.example .env
```

At minimum, set:

```sh
TG_BOT_TOKEN=your-telegram-bot-token
DATABASE_SUPERUSER_PASSWORD=replace-with-a-superuser-password
DATABASE_MIGRATOR_PASSWORD=replace-with-a-migrator-password
DATABASE_RUNTIME_PASSWORD=replace-with-a-runtime-password
```

For container secret stores, you can set file variables instead of direct secret values:

```sh
TG_BOT_TOKEN_FILE=/run/secrets/tg_bot_token
DATABASE_SUPERUSER_PASSWORD_FILE=/run/secrets/db_superuser_password
DATABASE_MIGRATOR_PASSWORD_FILE=/run/secrets/db_migrator_password
DATABASE_RUNTIME_PASSWORD_FILE=/run/secrets/db_runtime_password
```

Mount those files into the relevant containers from your private deployment repo. Direct values take precedence when both forms are set.

Useful options:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ADMIN_BACKEND_URL` | `http://localhost:8080` | Backend URL the admin web service calls when proxying API requests. Compose overrides this to `http://backend:8080` for in-network use. |
| `DATABASE_SUPERUSER` | `viesvatchecker_superadmin` | PostgreSQL bootstrap owner used by the database container. |
| `DATABASE_MIGRATOR_USER` | `viesvatchecker_migrator` | Role used by `db-migrator` to apply schema changes. |
| `DATABASE_RUNTIME_USER` | `viesvatchecker_runtime` | Lower-privilege role used by backend and worker services. |
| `*_FILE` secrets | empty | Optional file paths for Telegram and database passwords. |
| `TG_POLLING_ENABLED` | `true` | Enables Telegram long polling in the backend. |
| `TG_POLLING_INTERVAL_MS` | `1000` | Delay between polling cycles. |
| `PENDING_VAT_WORKER_CRON` | `0 * * * *` | Cron schedule for pending VAT checks. |
| `ADMIN_NOTIFICATION_CHANNELS` | empty | Comma-separated admin notification channels: `logger`, `telegram`, `ntfy`. Empty disables admin notifications. |
| `ADMIN_TELEGRAM_CHAT_IDS` | empty | Comma-separated Telegram chat IDs for admin notifications. Required when `telegram` is in `ADMIN_NOTIFICATION_CHANNELS`. |
| `ADMIN_NTFY_URL` | empty | Base URL of the ntfy server for admin notifications. Required when `ntfy` is in `ADMIN_NOTIFICATION_CHANNELS`. |
| `ADMIN_NTFY_TOPIC` | empty | ntfy topic for admin notifications. Required when `ntfy` is in `ADMIN_NOTIFICATION_CHANNELS`. |
| `ADMIN_NTFY_TOKEN` | empty | ntfy auth token. Prefer `ADMIN_NTFY_TOKEN_FILE` for container secret stores. |
| `ADMIN_NTFY_TOKEN_FILE` | empty | File path containing the ntfy auth token. |
| `MAX_PENDING_VAT_NUMBERS_PER_USER` | `10` | Per-user pending VAT limit. |
| `VAT_NUMBER_EXPIRATION_DAYS` | `90` | Days before a pending VAT number expires. |
| `VIES_URL` | EU VIES WSDL URL | VAT validation endpoint. |

Keep real secrets, hostnames, and deployment-specific overrides in `.env` or a private deployment repo. Do not commit them to this public repository.

## Admin Notifications

Admin notifications are disabled by default. Enable one or more channels with `ADMIN_NOTIFICATION_CHANNELS`, using a comma-separated list. Channels are useful for surfacing unrecoverable worker errors to operators.

`logger` writes admin alerts to the worker logs and is useful for local development:

```env
ADMIN_NOTIFICATION_CHANNELS=logger
```

`Telegram` sends admin alerts through the bot to one or more chat IDs:

```env
ADMIN_NOTIFICATION_CHANNELS=telegram
ADMIN_TELEGRAM_CHAT_IDS=123456789,987654321
```

`ntfy` sends alerts to an ntfy topic:

```env
ADMIN_NOTIFICATION_CHANNELS=ntfy
ADMIN_NTFY_URL=https://ntfy.example.com
ADMIN_NTFY_TOPIC=vies-alerts
ADMIN_NTFY_TOKEN_FILE=/run/secrets/ntfy_token
```

Channels can be combined:

```env
ADMIN_NOTIFICATION_CHANNELS=logger,telegram,ntfy
```

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

The admin web UI is published on host port `3000` by default. Open `http://<host>:3000/` to use it.

The backend HTTP service and PostgreSQL database stay on the internal Docker network. The backend is reachable from `admin-web` over `http://backend:8080`, but neither is published to the host by default.

Follow logs:

```sh
docker compose logs -f backend
```

## Production Hardening

The default `docker-compose.yml` only publishes the admin web service. Anything that talks to the backend or the database goes through the internal Docker network. This is intentional and is enough for a typical home or hobby deployment where you front the admin web with a tunnel, reverse proxy, or VPN (e.g. Twingate, Cloudflare Tunnel, Tailscale).

If you want to expose the admin web to the public internet, put it behind a reverse proxy that terminates TLS and adds authentication. Exposing port `3000` directly to the internet trusts every caller with full admin access to the application.

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
