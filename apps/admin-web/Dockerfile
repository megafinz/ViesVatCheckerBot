FROM oven/bun:1.3.14-alpine AS build

WORKDIR /app

COPY package.json bun.lock bunfig.toml tsconfig.json ./
COPY apps ./apps
COPY packages ./packages

RUN bun install --frozen-lockfile
RUN bun run --filter @viesvatchecker/admin-web build

FROM oven/bun:1.3.14-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/apps/admin-web/dist/index.js ./index.js
COPY --from=build /app/apps/admin-web/dist/client ./client

USER bun
EXPOSE 3000

CMD ["bun", "./index.js"]
