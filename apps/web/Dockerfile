# syntax=docker/dockerfile:1
#
# Built from the repository root:  docker build -f apps/web/Dockerfile .
#
# In AWS the built assets go to S3 + CloudFront instead; this image exists so the
# whole stack can be run with compose alone.

FROM node:22-alpine AS base
WORKDIR /repo

FROM base AS deps
COPY package.json package-lock.json .npmrc ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/gateway/package.json apps/gateway/
COPY libs/shared/package.json libs/shared/
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS build
COPY . .
# Vite inlines env at build time, so the API URL is a build argument.
ARG VITE_API_URL=http://localhost:4310
ENV VITE_API_URL=$VITE_API_URL
RUN cd apps/web && npx vite build

FROM nginx:1.27-alpine AS runner
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
