FROM oven/bun:1.3.14-alpine AS build

WORKDIR /app

COPY package.json bun.lock bunfig.toml tsconfig.json ./
COPY apps ./apps
COPY packages ./packages

RUN bun install --frozen-lockfile
RUN bun run --filter @viesvatchecker/backend build

FROM oven/bun:1.3.14-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/apps/backend/dist/index.js ./index.js

USER bun
EXPOSE 8080

CMD ["bun", "./index.js"]
