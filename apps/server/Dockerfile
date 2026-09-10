# syntax=docker/dockerfile:1
#
# Built from the repository root:  docker build -f apps/server/Dockerfile .
# The build context is the whole monorepo because the server depends on
# libs/shared through an npm workspace link.

FROM node:22-alpine AS base
WORKDIR /repo

# ---- dependencies -----------------------------------------------------------
# Only the manifests are copied first, so this layer is reused on every build
# that does not change a dependency.
FROM base AS deps
COPY package.json package-lock.json .npmrc ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/gateway/package.json apps/gateway/
COPY libs/shared/package.json libs/shared/
RUN --mount=type=cache,target=/root/.npm npm ci

# ---- build ------------------------------------------------------------------
FROM deps AS build
COPY . .
RUN npx prisma generate --schema apps/server/prisma/schema.prisma \
    --config apps/server/prisma.config.ts
RUN node apps/server/build.mjs

# ---- production dependencies ------------------------------------------------
# A separate install so the runtime image carries no build tooling.
FROM base AS prod-deps
COPY package.json package-lock.json .npmrc ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/gateway/package.json apps/gateway/
COPY libs/shared/package.json libs/shared/
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Never run as root.
RUN addgroup -S app && adduser -S app -G app

COPY --from=prod-deps --chown=app:app /repo/node_modules ./node_modules
COPY --from=build --chown=app:app /repo/apps/server/dist ./dist
# The generated Prisma client lives in src/ and the bundle imports it by
# relative path, so it ships alongside dist rather than inside it.
COPY --from=build --chown=app:app /repo/apps/server/src/db/generated ./src/db/generated
COPY --from=build --chown=app:app /repo/apps/server/prisma ./prisma
COPY --from=build --chown=app:app /repo/apps/server/prisma.config.ts ./prisma.config.ts

USER app
EXPOSE 4310

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4310/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
