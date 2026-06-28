# Current Behavior Snapshot

This is a local migration note for the Azure Functions + Mongo implementation before replacing `main` with the Bun/Postgres monorepo. It is intended to drive parity tests and implementation tasks during the rewrite.

## Test Status

Initial command attempted before dependency install:

```bash
npm test
```

Result:

```text
sh: cross-env: command not found
```

Dependencies were then installed from the lockfile:

```bash
npm ci
```

That completed successfully, with npm reporting 35 audit findings and warnings that install scripts for `fsevents` and `mongodb-memory-server` were not approved.

Running with the machine default Node runtime (`v26.3.0`) failed before executing tests:

```bash
npm test
```

Result:

```text
ReferenceError: require is not defined in ES module scope
at node_modules/yargs/yargs:3
```

The repo expects Node 20. Running through `nvm use 20` fixes the Mocha/yargs runtime issue:

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm test
```

With no `.env.test`, config parsing fails before tests execute because required settings are missing:

```text
ZodError: db.connectionString, vies.url, tg.botToken, api.azure.tg.url,
api.azure.tg.authToken, api.azure.http.url, api.azure.http.authToken are required
```

A local gitignored `.env.test` was created with placeholder values equivalent to `.env.example`, plus dummy token values. With Node `v20.9.0` and that local `.env.test`, the current suite initially executed:

```text
59 passing
8 failing
```

All 8 failures are in `TimerTrigger Tests` and happen before the intended assertions because the fake Azure context in `tests/test-context.ts` defines `context.log` as a function but does not define `context.log.warn` or `context.log.error`.

Failing groups:

- Six recoverable VIES error tests fail with:

```text
TypeError: context.log.warn is not a function
at TimerTrigger/index.ts:55
```

- Two unrecoverable error/demotion tests fail with:

```text
TypeError: context.log.error is not a function
at TimerTrigger/index.ts:60
```

The test fixture was fixed by adding no-op `warn` and `error` methods to `tests/test-context.ts`'s fake Azure logger. After that fix:

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm test
```

passes:

```text
67 passing
```

Interpretation: the legacy app behavior is covered and runnable on Node 20 with a local `.env.test`. Use this green suite as the pre-migration parity baseline.

## Runtime Shape

- `TgBotApi` is an Azure HTTP trigger used as the Telegram webhook endpoint.
- `TgBotApi` creates a Telegraf bot with `webhookReply: true`.
- On module initialization, it calls `bot.telegram.setWebhook(`${TG_BOT_API_URL}?code=${TG_BOT_API_TOKEN}`)`.
- Telegram command handlers do not call local business functions directly. They call `HttpApi` over HTTP with `HTTP_API_URL` and `HTTP_API_TOKEN`.
- `HttpApi` is an Azure HTTP trigger for user VAT operations.
- `HttpAdminApi` is an Azure HTTP trigger for admin/error operations.
- `TimerTrigger` is an Azure timer trigger scheduled hourly with cron expression `0 0 * * * *`.
- `lib/tg.ts` sends Telegram messages through `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`.
- `lib/vies.ts` uses `soap.createClientAsync(VIES_URL)` and calls `checkVatAsync`.

## Telegram Commands

### `/check VAT_NUMBER`

Current Telegram adapter behavior:

- Splits `ctx.update.message.text` by spaces and expects exactly one argument after `/check`.
- If argument count is not exactly one, replies:

```text
Please provide a single VAT number prefixed by country code: /check VAT_NUMBER (example: /check PL1234567890).
```

- Otherwise POSTs to:

```text
${HTTP_API_URL}/check?code=${HTTP_API_TOKEN}
```

with body:

```json
{
  "telegramChatId": "ctx.chat.id",
  "vatNumber": "VAT_NUMBER"
}
```

- Replies with the raw response body from `HttpApi`.

### `/uncheck VAT_NUMBER`

Current Telegram adapter behavior:

- Splits command text by spaces and expects exactly one argument.
- If argument count is not exactly one, replies:

```text
Please provide a single VAT number prefixed by country code: /uncheck VAT_NUMBER(example: /uncheck PL1234567890).
```

Note the missing space before `(example...)` in the current message.

- Otherwise POSTs to:

```text
${HTTP_API_URL}/uncheck?code=${HTTP_API_TOKEN}
```

with body:

```json
{
  "telegramChatId": "ctx.chat.id",
  "vatNumber": "VAT_NUMBER"
}
```

### `/uncheckall`

Current Telegram adapter behavior:

- Does not require arguments.
- POSTs to:

```text
${HTTP_API_URL}/uncheckAll?code=${HTTP_API_TOKEN}
```

with body:

```json
{
  "telegramChatId": "ctx.chat.id"
}
```

### `/list`

Current Telegram adapter behavior:

- Does not require arguments.
- GETs:

```text
${HTTP_API_URL}/list?telegramChatId=${ctx.chat.id}&code=${HTTP_API_TOKEN}
```

## VAT Parsing And User API Validation

`parseVatNumber(vatNumberString)`:

- `countryCode` is the first two characters, uppercased.
- `vatNumber` is the rest of the string unchanged.

`HttpApi` validation:

- `telegramChatId` is read from query first, then body.
- `action` is read from `req.params.action`.
- Supported actions: `check`, `uncheck`, `uncheckAll`, `list`.
- Missing `telegramChatId` returns 400:

```text
Missing Telegram Chat ID
```

- Missing/invalid action returns 400 containing:

```text
Missing or invalid action
```

- `check` and `uncheck` require `vatNumber` from query first, then body.
- Missing VAT number returns 400:

```text
Missing VAT number.
```

- VAT strings shorter than three characters return 400:

```text
VAT number is in invalid format (expected at least 3 symbols).
```

## `check` Behavior

Before checking:

- Initializes VIES client.
- Initializes DB connection.
- Calls VIES with `{ countryCode, vatNumber }`.

If VIES returns `valid: true`:

- Removes the matching pending VAT request if present.
- Returns 200:

```text
🟢 VAT number 'CCNUMBER' is valid.
```

If VIES returns invalid:

- Counts current pending VAT requests for the user.
- If count is lower than `MAX_PENDING_VAT_NUMBERS_PER_USER` (default 10), adds the VAT request only if not already present.
- New pending requests get default expiration of 90 days from insertion unless an explicit expiration date is provided.
- Returns 200:

```text
🕓 VAT number 'CCNUMBER' is not registered in VIES yet. We will monitor it for 90 days and notify you if it becomes valid (or if the monitoring period expires).
```

If user already has the maximum number of pending VAT requests:

- Does not add a new request.
- Returns 400:

```text
🔴 Sorry, you reached the limit of maximum VAT numbers you can monitor (10).
```

If the same pending VAT request is already present:

- Does not add a duplicate.
- Still returns the same 200 monitoring message.

## `check` Error Behavior

`ViesError` type detection:

- Known recoverable VIES types:
  - `SERVICE_UNAVAILABLE`
  - `MS_UNAVAILABLE`
  - `MS_MAX_CONCURRENT_REQ`
  - `GLOBAL_MAX_CONCURRENT_REQ`
  - `TIMEOUT`
  - `CONNECTION_ERROR`
- `INVALID_INPUT` is known but not recoverable.
- Message containing `Unexpected root element of WSDL` maps to `SERVICE_UNAVAILABLE`.
- Message containing `ECONNRESET` maps to `CONNECTION_ERROR`.
- Message containing `ETIMEDOUT` maps to `TIMEOUT`.
- Unknown VIES messages have type `unknown`.

If VIES returns `INVALID_INPUT`:

- Does not add a pending request.
- Returns 400:

```text
🔴 There was a problem validating your VAT number 'CCNUMBER'. Make sure it is in the correct format.
```

If VIES returns `SERVICE_UNAVAILABLE` or `MS_UNAVAILABLE`:

- Adds the pending request if unique.
- Returns 500:

```text
🟡 There was a problem validating your VAT number 'CCNUMBER' (looks like VIES validation service is not available right now). We'll keep monitoring it for a while.
```

If VIES returns any other recoverable VIES error:

- Adds the pending request if unique.
- Returns 500:

```text
🟡 There was a problem validating your VAT number 'CCNUMBER'. We'll keep monitoring it for a while.
```

If VIES returns unknown/unrecoverable VIES error:

- Does not add a pending request.
- Returns 500:

```text
🔴 There was a problem validating your VAT number 'CCNUMBER'. Looks like VIES validation service is not working as expected. Please try again later.
```

If any non-VIES error escapes:

- Does not add a pending request.
- Returns 500:

```text
🔴 We're having some technical difficulties processing your request, please try again later.
```

## `uncheck` Behavior

- Requires valid `telegramChatId` and VAT number input.
- Removes the matching pending request if present.
- Returns 200 even if there was no matching pending request:

```text
VAT number 'CCNUMBER' is no longer being monitored.
```

## `list` Behavior

- Lists only VAT requests for the supplied `telegramChatId`.
- If there are monitored numbers, returns 200:

```text
You monitor the following VAT numbers:

'CCNUMBER', 'CCNUMBER2'.
```

- If there are none, returns 200:

```text
You are not monitoring any VAT numbers.
```

## `uncheckAll` Behavior

- Removes all pending requests for the supplied `telegramChatId`.
- Does not remove pending requests for other Telegram chat IDs.
- Returns 200:

```text
You no longer monitor any VAT numbers.
```

## Timer Job Behavior

Schedule:

```text
0 0 * * * *
```

Meaning: hourly at minute zero in Azure Functions cron syntax.

On start:

- Initializes DB.
- Initializes VIES.
- Reads all pending VAT requests.
- If none exist, logs and returns.

For each pending VAT request:

If VIES returns `valid: true`:

- Removes the pending request.
- Sends Telegram message to the user:

```text
🟢 Congratulations, VAT number 'CCNUMBER' is now VALID!
```

If VIES returns invalid and the pending request has expired:

- Removes the pending request.
- Sends Telegram message:

```text
🔴 You VAT number 'CCNUMBER' is no longer monitored because it's still invalid and it's been too long since you registered it. Make sure you entered the right VAT number or that the entity that this VAT number belongs to actually applied for registration in VIES.
```

- Current implementation then `break`s out of the loop, so later pending requests in the same run are not processed after the first expired invalid request. Preserve deliberately or change intentionally with a test.

If VIES returns invalid and the request has not expired:

- Leaves the pending request in DB.
- Does not notify the user.

If VIES/repo logic throws a recoverable app error:

- Logs warning.
- Returns from the timer run.
- Does not demote the request to error.
- Leaves existing pending request in DB.

If any other error occurs:

- Removes the pending request and adds a VAT request error with the same VAT request fields and error message.
- Sends Telegram message to the user:

```text
🔴 Sorry, something went wrong and we had to stop monitoring the VAT number 'CCNUMBER'. We'll investigate what happened and try to resume monitoring. We'll notify you when that happens. Sorry for the inconvenience.
```

- If `NOTIFY_ADMIN_ON_UNRECOVERABLE_ERRORS` is true and `TG_ADMIN_CHAT_ID` is set, sends admin message:

```text
🔴🔴🔴 [ADMIN] There was an error while processing VAT number 'CCNUMBER': ERROR_MESSAGE
```

- Sets `context.res = { status: 500, body: error.message }`.
- Does not explicitly stop the loop after this branch.

## Admin API Behavior

Supported admin actions:

- `list`
- `listErrors`
- `resolveError`
- `resolveAllErrors`
- `removeError`
- `update`

Missing/invalid action returns 400:

```text
Missing or invalid action (should be one of: list, listErrors, resolveError, resolveAllErrors, removeError, update)
```

Admin API initializes DB before handling valid actions.

### `list`

- Returns 200 with all pending VAT requests.

### `listErrors`

- Returns 200 with all VAT request errors.

### `resolveError`

Inputs:

- `errorId` from query first, then body.
- `silent` from query first, then body.

Missing `errorId` returns 400:

```text
Missing VAT Request Error ID
```

Unknown or invalid `errorId` returns 404:

```text
VAT Request Error with id 'ERROR_ID' not found
```

On success:

- Removes the specified error.
- If other errors remain for the same VAT request, does not resume monitoring.
- If no errors remain for the same VAT request, tries to add the original VAT request back to pending with the original expiration date.
- If pending request is already present, does not duplicate it.
- Returns 204 for all successful resolve variants.

Notification:

- If resolving the last error resumes monitoring and `silent` is not truthy, sends Telegram message to the original user:

```text
We resumed monitoring your VAT number 'CCNUMBER'.
```

Current `silent` handling note:

- `silent ??= false` is used.
- Values come from query/body without boolean coercion.
- Query string values such as `"true"` are truthy and therefore suppress notification.

### `resolveAllErrors`

- Iterates all current VAT request errors and calls the same resolve flow for each.
- If `silent` is true/truthy, suppresses notifications.
- Removes all errors.
- Adds each affected VAT request back to pending once all its errors are resolved.
- Returns 204.

### `removeError`

Inputs:

- `errorId` from query first, then body.

Missing `errorId` returns 400:

```text
Missing VAT Request Error ID
```

Unknown or invalid `errorId` returns 404:

```text
VAT Request Error with id 'ERROR_ID' not found
```

On success:

- Removes only the specified error.
- Does not resume monitoring.
- Returns 204.

### `update`

Inputs:

- `telegramChatId` from query first, then body.
- `vatNumber` from query first, then body.
- `newVatNumber` from query first, then body.

Missing `telegramChatId` returns 400:

```text
Missing Telegram Chat ID
```

Missing `vatNumber` returns 400:

```text
Missing VAT Number
```

Missing `newVatNumber` returns 400:

```text
Missing new VAT Number
```

If `vatNumber === newVatNumber`:

- Returns 204 without checking DB.

If pending VAT request is not found:

- Returns 404:

```text
VAT Request with number 'OLD' and Telegram Chat ID 'CHAT_ID' not found.
```

If found:

- Parses old and new VAT numbers using the same first-two-characters country-code rule.
- Updates country code and VAT number.
- Keeps original Telegram chat ID and expiration date.
- Returns 204.

Current note:

- `update` has a TODO to validate new VAT number.

## Data Model And Persistence

TypeScript models:

```ts
interface VatRequest {
  telegramChatId: string;
  countryCode: string;
  vatNumber: string;
}

interface PendingVatRequest extends VatRequest {
  expirationDate: Date;
}

interface VatRequestError {
  id: string;
  vatRequest: PendingVatRequest;
  error: string;
}
```

Mongo/Mongoose collections:

- Model `VatRequest`, collection `VatRequests`.
- Model `VatRequestError`, collection `VatRequestErrors`.

`VatRequests` document fields:

- `telegramChatId: String`
- `countryCode: String`
- `vatNumber: String`
- `expirationDate: Date`

`VatRequestErrors` document fields:

- `telegramChatId: String`
- `countryCode: String`
- `vatNumber: String`
- `expirationDate: Date`
- `error: String`

Repository behavior:

- `init(connectionString = cfg.db.connectionString)` connects once and caches mongoose connection.
- `tearDown()` disconnects and clears cached connection.
- `addVatRequest(doc, expirationDate?)` inserts with explicit expiration or `now + VAT_NUMBER_EXPIRATION_DAYS`.
- `tryAddUniqueVatRequest(doc, expirationDate?)` checks for existing by chat/country/VAT and only inserts if none exists.
- No database-level unique constraint currently exists.
- `removeVatRequest(doc)` deletes by chat/country/VAT.
- `getAllVatRequests(telegramChatId?)` filters by chat if supplied.
- `countVatRequests(telegramChatId)` counts pending requests by chat.
- `removeAllVatRequests(telegramChatId)` deletes by chat.
- `addVatRequestError(doc, message)` copies pending request fields into `VatRequestErrors`.
- `findVatRequestError(id)` returns null for invalid Mongo ObjectId.
- `countVatRequestErrors(vatRequest)` counts errors by chat/country/VAT.
- `removeVatRequestError(id)` returns false for invalid Mongo ObjectId.
- `resolveVatRequestError(id)` runs a transaction-like `withTransaction` wrapper.
- `demoteVatRequestToError(vatRequest, message)` removes pending request then adds an error.
- `getAllVatRequestErrors()` returns all errors.
- `updateVatRequest(doc, update)` updates country/VAT on an existing pending request.

Current transaction note:

- `withTransaction` starts a mongoose session and calls `session.withTransaction(fn)`, but the model operations inside the callbacks do not appear to pass the session into each query/save. Preserve behavior only if needed; Postgres implementation should use real transactions for demote/resolve.

## Environment Variables

Current `lib/cfg.ts` variables:

- `MONGODB_CONNECTION_STRING`
- `VIES_URL`
- `TG_BOT_TOKEN`
- `TG_BOT_API_URL`
- `TG_BOT_API_TOKEN`
- `HTTP_API_URL`
- `HTTP_API_TOKEN`
- `NOTIFY_ADMIN_ON_UNRECOVERABLE_ERRORS`
- `TG_ADMIN_CHAT_ID`
- `VAT_NUMBER_EXPIRATION_DAYS`
- `MAX_PENDING_VAT_NUMBERS_PER_USER`

Current defaults:

- `NOTIFY_ADMIN_ON_UNRECOVERABLE_ERRORS`: defaults to false.
- `VAT_NUMBER_EXPIRATION_DAYS`: defaults to 90.
- `MAX_PENDING_VAT_NUMBERS_PER_USER`: defaults to 10.

Required by schema because no defaults:

- Mongo connection string.
- VIES URL.
- Telegram bot token.
- Telegram API URL/auth token.
- HTTP API URL/auth token.

README local settings also mention Azure Functions runtime/storage:

- `FUNCTIONS_WORKER_RUNTIME`
- `AzureWebJobsStorage`

Those are Azure runtime concerns, not domain behavior.

## Test Fixtures And Coverage Notes

Current tests use:

- `ts-mocha`, Chai, Sinon.
- `mongodb-memory-server`.
- Fake Azure `Context`.
- Sinon stubs for VIES and Telegram.

Test coverage includes:

- HTTP API validation.
- `check` valid/invalid/error behavior.
- max pending request limit.
- duplicate pending request behavior.
- `uncheck`, `list`, `uncheckAll`.
- Timer valid/invalid/expired/recoverable/unrecoverable behavior.
- Admin list/listErrors/resolve/remove/update behavior.

Coverage gaps to address in the new suite:

- Direct Telegram command adapter behavior is not currently tested.
- Exact Telegram adapter command argument parsing is not currently tested.
- Admin notification branch for unrecoverable timer errors is not covered by current tests.
- `update` new VAT validation remains TODO.
- Timer loop behavior after an unrecoverable error is not explicitly asserted.
- Timer loop `break` after an expired invalid request is not explicitly asserted beyond single-request behavior.
