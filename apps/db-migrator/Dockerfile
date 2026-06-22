FROM oven/bun:1.3.14-alpine AS build

WORKDIR /app

COPY package.json bun.lock bunfig.toml tsconfig.json ./
COPY apps ./apps
COPY packages ./packages

RUN bun install --frozen-lockfile
RUN bun run --filter @viesvatchecker/db-migrator build

FROM oven/bun:1.3.14-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/apps/db-migrator/dist/index.js ./index.js
COPY --from=build /app/packages/db/drizzle ./drizzle

USER bun

CMD ["bun", "./index.js"]
