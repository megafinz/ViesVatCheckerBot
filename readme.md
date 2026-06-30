# What's This?

This is a [Telegram bot](https://core.telegram.org/bots) implementation for checking the validity of VAT numbers in [VIES](https://ec.europa.eu/taxation_customs/vies) (VAT Information Exchange System).

# What Does It Do?

You can submit a VAT number that will be checked in VIES. If the number is valid, the bot will tell you exactly that. If the number is not valid, the bot will store the number and check it periodically until it becomes valid. The bot will notify you when that happens.

You can do the same manually here: https://ec.europa.eu/taxation_customs/vies

# How Does It Do That?

Code is [TypeScript](https://www.typescriptlang.org) running on the [Bun](https://bun.sh) runtime. Persistence is [PostgreSQL](https://www.postgresql.org/) accessed through [Drizzle ORM](https://orm.drizzle.team). The HTTP API is built on [Elysia](https://elysiajs.com), and the Telegram bot client talks directly to the Bot API over HTTPS long polling.

# Why Do I Use What I Use?

- **Bun**: fast TypeScript-first runtime with a built-in test runner, package manager, and bundler; keeps the stack to a single binary.
- **PostgreSQL**: durable, ubiquitous, free; gives me real transactions and a role-permission model I can lean on.
- **Drizzle**: type-safe SQL builder that pairs well with strict TypeScript; migrations are plain SQL files I can review.
- **Elysia**: lightweight HTTP framework; small surface, no decorators, plays well with dependency-injected handlers.
- **Telegram long polling**: no public domain or webhook endpoint required; the bot can run entirely on a private network.
- **Telegram**: I use it a lot so wanted to explore implementing bots. Simple solution for providing UI and notifications.

# Architecture

The repo is a [Bun workspace](https://bun.sh/docs/cli/workspaces) monorepo with two top-level directories:

- `apps/` — runnable services.
  - `backend` — HTTP API plus the Telegram long-polling loop.
  - `pending-vat-worker` — one-shot job that re-checks pending VAT numbers.
  - `db-migrator` — applies database schema migrations and grants runtime role privileges.
  - `legacy-mongo-migrator` — one-shot importer from the legacy MongoDB database.
  - `admin-web` — internal admin web app (React + Elysia BFF).
- `packages/` — shared libraries consumed by apps.
  - `core` — domain logic: VAT parsing, Telegram command handling, pending-job processing.
  - `adapters` — Telegram HTTP client, VIES SOAP client, admin-notification channels.
  - `db` — Drizzle schema and Postgres repositories.
  - `config` — typed, zod-derived configuration parsers shared across services.

See [`SELF_HOSTING.md`](./SELF_HOSTING.md) for a complete self-hosting guide, including the Docker Compose layout, environment variables, secret-file fallbacks, role separation, and operational commands.

# Run / Develop

Install Bun 1.3.14 and clone the repo. Then:

```sh
bun install
bun run build
bun run lint
bun run test
bun run typecheck
```

To run the backend in dev mode with auto-reload:

```sh
bun run dev:backend
```

The Telegram polling loop calls `deleteWebhook` before starting so that any webhook the Bot API still has registered for the bot cannot intercept updates.

To run the admin web app in dev mode:

```sh
bun run dev:admin-web
```

## Self-host with Docker Compose

The repo ships a multi-stage Docker setup for self-hosted deployments. See [`SELF_HOSTING.md`](./SELF_HOSTING.md) for the full guide.

```sh
cp .env.example .env
# edit .env to set TG_BOT_TOKEN and the database passwords
docker compose up -d db
docker compose run --rm db-migrator
docker compose up -d backend
docker compose --profile admin up -d admin-web
docker compose --profile scheduler up -d pending-vat-worker-cron
```

The admin web UI is published on host port `3000`. Open `http://localhost:3000/` after the services are up.

# Tests

Unit and integration tests live next to the code as `*.test.ts` files and run with Bun's built-in test runner. Postgres repository integration tests skip themselves unless `DATABASE_URL` is set.

```sh
bun run test
```

End-to-end tests run against the locally composed stack:

```sh
bun run smoke:compose
```

# Why Does It Do That?

## Main Use Case

When you register an entity in EU, chances are that you need to be registered in VIES as well. It can take some time during which you'll probably get bored manually entering your VAT number and seeing that it's not yet valid. This bot is aimed to automate VAT number validation for you.

## Alternative Use Case

You need to verify that some other entity has a valid VAT number for transactions within EU.
