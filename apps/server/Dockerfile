# syntax=docker/dockerfile:1
#
# Built from the repository root:  docker build -f apps/server/Dockerfile .
# The build context is the whole monorepo because the server depends on
# libs/shared through a workspace link.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

# ---- dependencies -----------------------------------------------------------
# Only the manifests are copied first, so this layer is reused on every build
# that does not change a dependency.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/gateway/package.json apps/gateway/
COPY libs/shared/package.json libs/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---- build ------------------------------------------------------------------
FROM deps AS build
COPY . .
RUN pnpm --filter @sb/server exec prisma generate
RUN pnpm --filter @sb/server exec node build.mjs
# `pnpm deploy` resolves the workspace link into a real, pruned node_modules --
# the trick that keeps a monorepo image from shipping the entire workspace.
RUN pnpm --filter @sb/server deploy --prod --legacy /out

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Never run as root.
RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /out/node_modules ./node_modules
COPY --from=build --chown=app:app /repo/apps/server/dist ./dist
# The generated Prisma client lives in src/ and the bundle imports it
# by relative path, so it ships alongside dist rather than inside it.
COPY --from=build --chown=app:app /repo/apps/server/src/db/generated ./src/db/generated
COPY --from=build --chown=app:app /repo/apps/server/prisma ./prisma
COPY --from=build --chown=app:app /repo/apps/server/prisma.config.ts ./prisma.config.ts

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
