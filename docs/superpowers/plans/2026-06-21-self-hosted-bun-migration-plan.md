# Self-Hosted Bun Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Azure Functions implementation with a clean public-ready Bun monorepo that runs the Telegram bot, internal API, scheduled VAT checks, Postgres persistence, and a minimal internal admin web app.

**Architecture:** Rebuild the repo around Bun workspaces. Keep business behavior in framework-independent packages, expose runtime behavior through an Elysia backend, use Telegram long polling instead of webhooks, and use Drizzle/Postgres for storage. Keep private deployment overlays outside this repo; only generic local/self-hosted examples belong here.

**Tech Stack:** Bun, TypeScript, Elysia, Telegraf, Drizzle, Postgres, Vitest, Docker Compose.

---

## Public Repository Rules

- Do not commit private repository names, private registry names, real hostnames, gateway labels, Infisical paths, or secret values.
- Committed deployment files must be generic examples or local development files.
- Real homelab deployment configuration must live outside this repository.
- The migration plan may stay uncommitted while implementation is in progress.

## Target Structure

```text
apps/backend
apps/admin-web
apps/legacy-mongo-migrator
packages/config
packages/core
packages/db
docs/deployment
docker-compose.dev.yml
compose.example.yml
.env.example
```

## Task 1: Snapshot Current Behavior

**Files:**
- Read: `TgBotApi/index.ts`
- Read: `HttpApi/index.ts`
- Read: `HttpApi/handlers.ts`
- Read: `HttpAdminApi/handlers.ts`
- Read: `TimerTrigger/index.ts`
- Read: `lib/db.ts`
- Read: `lib/vies.ts`
- Read: `lib/tg.ts`
- Read: `tests/*.ts`

- [ ] Record current Telegram commands: `/check`, `/uncheck`, `/uncheckall`, `/list`.
- [ ] Record current pending VAT processing behavior.
- [ ] Record current admin error resolution behavior.
- [ ] Record current DB collections and fields.
- [ ] Record current environment variables.
- [ ] Run the current test suite before deleting old structure.

Run:

```bash
npm test
```

Expected: either passing tests, or a recorded list of current failures before migration starts.

## Task 2: Replace Project Skeleton With Bun Workspace

Legacy test baseline before replacing the project skeleton:

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm test
```

Expected current result:

```text
67 passing
```

Note: the old Mocha stack fails under Node 26 with:

```text
ReferenceError: require is not defined in ES module scope
at node_modules/yargs/yargs:3
```

Do not spend migration effort making the old Mocha stack support Node 26 unless the old stack must live longer than planned. The target runtime/test stack is Bun/Vitest.

**Files:**
- Modify: `package.json`
- Create: `bunfig.toml`
- Create: `tsconfig.json`
- Create: `turbo.json` if using task orchestration
- Create: `apps/backend/package.json`
- Create: `apps/admin-web/package.json`
- Create: `apps/legacy-mongo-migrator/package.json`
- Create: `packages/config/package.json`
- Create: `packages/core/package.json`
- Create: `packages/db/package.json`

- [ ] Remove Azure Functions scripts and Node/Mocha scripts.
- [ ] Add Bun workspace scripts for build, test, lint, dev, and typecheck.
- [ ] Pin package versions exactly.
- [ ] Keep the root package private.

Example root scripts:

```json
{
  "scripts": {
    "build": "bun run --filter '*' build",
    "test": "bun run --filter '*' test",
    "typecheck": "bun run --filter '*' typecheck",
    "dev:backend": "bun --watch apps/backend/src/index.ts",
    "dev:admin-web": "bun --watch apps/admin-web/src/index.ts",
    "legacy:migrate": "bun apps/legacy-mongo-migrator/src/index.ts"
  }
}
```

Run:

```bash
bun install
bun run typecheck
```

Expected: workspace installs and typecheck command exists, even if packages are still skeletal.

## Task 3: Add Shared Config Package

**Files:**
- Create: `packages/config/src/index.ts`
- Create: `packages/config/src/env.ts`
- Create: `packages/config/src/env.test.ts`

- [ ] Define a typed configuration schema.
- [ ] Support file-based secrets for container deployments where useful.
- [ ] Include separate config sections for backend, database, Telegram, VIES, admin, and migration.
- [ ] Validate required variables at process startup.

Core variables:

```text
NODE_ENV
HOST
PORT
DATABASE_HOST
DATABASE_PORT
DATABASE_NAME
DATABASE_USER
DATABASE_PASSWORD
DATABASE_PASSWORD_FILE
TG_BOT_TOKEN
VIES_URL
INTERNAL_API_TOKEN
MONGODB_CONNECTION_STRING
VAT_NUMBER_EXPIRATION_DAYS
MAX_PENDING_VAT_NUMBERS_PER_USER
```

Run:

```bash
bun test packages/config
```

Expected: config tests pass for valid env, missing required env fails clearly.

## Task 4: Port Core Domain Behavior

**Files:**
- Create: `packages/core/src/vat.ts`
- Create: `packages/core/src/vies.ts`
- Create: `packages/core/src/telegram-commands.ts`
- Create: `packages/core/src/pending-vat-job.ts`
- Create: `packages/core/src/errors.ts`
- Create: `packages/core/src/index.ts`
- Create tests under: `packages/core/src/*.test.ts`

- [x] Port VAT number parsing.
- [x] Port VIES SOAP validation behavior.
- [x] Port Telegram command behavior into framework-independent use cases.
- [x] Port pending VAT processing from the timer trigger.
- [x] Preserve user-facing messages unless deliberately changed.
- [x] Keep Telegram adapter, HTTP framework, and database implementation out of core business logic.

Run:

```bash
bun test packages/core
```

Expected: core behavior tests pass.

## Task 5: Add Drizzle/Postgres Package

**Files:**
- Create: `packages/db/src/schema.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/repositories/vat-requests.ts`
- Create: `packages/db/src/repositories/vat-request-errors.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/drizzle.config.ts`
- Create tests under: `packages/db/src/**/*.test.ts`

- [ ] Model pending VAT requests.
- [ ] Model VAT request errors.
- [ ] Add unique constraint on `telegram_chat_id`, `country_code`, `vat_number` for pending requests.
- [ ] Implement repository methods equivalent to the current Mongo functions.
- [ ] Test repositories against a test Postgres database.

Run:

```bash
bun test packages/db
```

Expected: repository tests pass against test Postgres.

## Task 6: Build Migrator App

**Files:**
- Create: `apps/legacy-mongo-migrator/src/migrate.ts`
- Create: `apps/legacy-mongo-migrator/src/mongo-source.ts`
- Create: `apps/legacy-mongo-migrator/src/postgres-target.ts`
- Create tests under: `apps/legacy-mongo-migrator/src/*.test.ts`

- [x] Connect directly to the old Mongo-compatible source database.
- [x] Connect to the new Postgres target.
- [x] Copy pending VAT requests.
- [x] Copy VAT request errors.
- [x] Make migration safe to re-run for tiny production data.
- [x] Add a dry-run or verify mode that prints source/target counts.

Run:

```bash
bun apps/legacy-mongo-migrator/src/index.ts --verify
```

Expected: verification prints source and target counts without mutating data.

## Task 7: Build Elysia Backend

**Files:**
- Create: `apps/backend/src/index.ts`
- Create: `apps/backend/src/app.ts`
- Create: `apps/backend/src/routes/health.ts`
- Create: `apps/backend/src/routes/internal-api.ts`
- Create: `apps/backend/src/routes/internal-jobs.ts`
- Create: `apps/backend/src/telegram/bot.ts`
- Create: `apps/backend/src/telegram/messages.ts`
- Create tests under: `apps/backend/src/**/*.test.ts`

- [ ] Start an Elysia app on `HOST` and `PORT`.
- [ ] Add `GET /health`.
- [ ] Add internal API routes for check, uncheck, uncheck all, list, error list, error resolve, and error removal.
- [ ] Protect internal routes with `INTERNAL_API_TOKEN`.
- [ ] Start Telegram long polling with `bot.launch`.
- [ ] Delete any existing webhook before launching polling.
- [ ] Call core use cases directly from Telegram handlers.
- [ ] Ensure graceful shutdown stops Telegram polling and HTTP server.

Run:

```bash
bun test apps/backend
bun run dev:backend
```

Expected: backend starts, health route responds, tests pass.

## Task 8: Add Cron Trigger

**Files:**
- Create: `docker/cron/crontab`
- Create: `docker/cron/Dockerfile`
- Modify: `docker-compose.dev.yml`
- Modify: `compose.example.yml`

- [ ] Add a tiny cron container.
- [ ] Configure it to call the backend internal job endpoint.
- [ ] Pass `INTERNAL_API_TOKEN` to the request.
- [ ] Log cron output to container logs.
- [ ] Schedule the job hourly, offset from minute zero.

Example cron command:

```cron
7 * * * * wget -qO- --header="Authorization: Bearer ${INTERNAL_API_TOKEN}" --post-data="" http://backend:8080/internal/jobs/check-vat-requests >> /proc/1/fd/1 2>&1
```

Run:

```bash
docker compose -f docker-compose.dev.yml up cron backend db
```

Expected: cron container starts and can trigger the protected backend endpoint.

## Task 9: Add Minimal Admin Web App

**Files:**
- Create: `apps/admin-web/src/index.ts`
- Create: `apps/admin-web/src/app.tsx`
- Create: `apps/admin-web/src/api.ts`
- Create tests under: `apps/admin-web/src/**/*.test.ts`

- [ ] Add a minimal internal web app.
- [ ] Show backend health/status.
- [ ] Do not build the full admin workflow in this migration.
- [ ] Keep the app deployable as a separate container.

Run:

```bash
bun test apps/admin-web
bun run dev:admin-web
```

Expected: admin web app starts and displays basic status.

## Task 10: Add Dockerfiles And Generic Compose

**Files:**
- Create: `apps/backend/Dockerfile`
- Create: `apps/admin-web/Dockerfile`
- Create: `apps/legacy-mongo-migrator/Dockerfile`
- Create: `docker-compose.dev.yml`
- Create: `compose.example.yml`
- Create: `.env.example`
- Create: `.dockerignore`

- [ ] Use Bun Alpine base images.
- [ ] Build production bundles with `bun build --target=bun`.
- [ ] Run containers as non-root Bun user where possible.
- [ ] Include local Postgres in `docker-compose.dev.yml`.
- [ ] Keep `compose.example.yml` generic and public-safe.
- [ ] Do not include private hostnames, private registry names, or real secret paths.

Run:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Expected: local stack starts with Postgres, backend, cron, and admin web.

## Task 11: Add Public-Safe Deployment Docs

**Files:**
- Create: `docs/deployment/self-hosted.md`
- Create: `docs/deployment/cutover.md`

- [ ] Document generic self-hosting requirements.
- [ ] Document required environment variables.
- [ ] Document Telegram polling behavior.
- [ ] Document direct Mongo-compatible source to Postgres migration.
- [ ] Document cutover and rollback steps generically.
- [ ] Avoid private environment names, private repo names, hostnames, registry names, and gateway labels.

Run:

```bash
rg -n "private|homelab|registry\\.|internal-domain|specific-overlay-name" docs .env.example compose.example.yml
```

Expected: no private identifiers or accidental real infrastructure references.

## Task 12: Remove Old Azure/Mongo Runtime

**Files:**
- Delete old Azure Functions entrypoints.
- Delete old function metadata files.
- Delete old Mocha test setup.
- Remove unused Azure dependencies.
- Remove unused Mongo runtime dependencies after migrator boundaries are complete.

- [ ] Remove `TgBotApi`, `HttpApi`, `HttpAdminApi`, and `TimerTrigger` Azure entrypoints after behavior is ported.
- [ ] Remove `host.json` and `function.json` files.
- [ ] Remove `@azure/functions`.
- [ ] Remove old Mocha/Chai/Sinon setup once Vitest tests cover behavior.
- [ ] Keep Mongo client dependency only in migrator if direct migration still needs it.

Run:

```bash
bun install
bun run build
bun run test
```

Expected: build and tests pass without Azure Functions runtime.

## Task 13: Live Cutover Checklist

- [ ] Build and publish images using the private deployment process outside this repo.
- [ ] Deploy Postgres and backend with Telegram polling disabled or test token first.
- [ ] Run Drizzle migrations.
- [ ] Enter maintenance window.
- [ ] Disable old Azure timer processing.
- [ ] Disable old Azure webhook processing.
- [ ] Run direct migration from old Mongo-compatible database to Postgres.
- [ ] Verify migrated row counts and sample rows.
- [ ] Delete Telegram webhook.
- [ ] Start backend with live bot token and polling enabled.
- [ ] Start cron trigger.
- [ ] Send a Telegram `/list` command from an allowed test chat.
- [ ] Trigger protected job endpoint once manually.
- [ ] Watch backend, cron, and database logs.

Rollback during maintenance:

- [ ] Stop the Bun backend polling process.
- [ ] Restore the previous Telegram webhook to the old deployment.
- [ ] Re-enable old timer processing.
- [ ] Leave Postgres data in place for inspection.

## Verification Before Merge

Run:

```bash
bun run typecheck
bun run test
docker compose -f docker-compose.dev.yml up --build
```

Expected:

- Typecheck passes.
- Tests pass.
- Local stack starts.
- Backend health check passes.
- Protected internal endpoints reject missing/invalid token.
- Telegram polling is disabled or mocked in automated tests.
- No private deployment identifiers are committed.
