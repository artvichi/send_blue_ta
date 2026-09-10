# Deployment

GitHub → Docker → Terraform → AWS. The Terraform is real and validated, but never
applied: this is an assessment, not a running service.

## Docker

Multi-stage builds: `deps` (`npm ci`, layer-cached on the manifests alone) →
`build` → `runner` (`node:22-alpine`, non-root). A separate `prod-deps` stage
runs `npm ci --omit=dev`, so the runtime image carries no build tooling.

`docker-compose.yml` runs Postgres for local development. `docker-compose.full.yml`
adds the server and web for a container-only run.

**The gateway has no Dockerfile.** It needs macOS APIs and a signed-in Apple
account; containerizing it is not possible, not merely inconvenient.

### Two build details worth knowing

**`server` and `gateway` bundle with esbuild rather than `tsc --outDir`.** tsc
does not rewrite path aliases on emit, so a tsc build emits JavaScript that still
imports `@sb/shared` and cannot resolve it at runtime. Bundling inlines the
library, which is what a deployable artifact wants anyway. The consequence is
that `libs/shared`'s runtime dependencies become the app's, and are declared as
such in each app's `package.json`.

**The Prisma client is generated outside `node_modules`.** It lives in
`apps/server/src/db/generated` — outside `node_modules` — so it depends on npm
hoisting `@prisma/client`'s internals to the root. Under a strict, non-hoisting
layout the built server fails at *startup*, not at build time.

## CI (`.github/workflows/ci.yml`)

On every pull request: install with an npm cache → typecheck → lint → unit tests
→ integration tests against a Postgres **service container** → build.

Nx caching means only affected projects rebuild.

## Release (`.github/workflows/release.yml`)

On `main`: build and tag images by git SHA, push to ECR, then `terraform plan`.

Authentication is **GitHub OIDC into an IAM role**. No long-lived AWS keys exist
anywhere in the repo or in GitHub secrets.

## Terraform (`infra/`)

Remote state in S3 with a DynamoDB lock table. Modules:

| Module | Contents |
|---|---|
| `network` | VPC, two AZs, public and private subnets, NAT |
| `data` | RDS Postgres in private subnets, credentials in Secrets Manager |
| `app` | ECR, ECS Fargate service behind an ALB, autoscaling |
| `web` | S3 + CloudFront + ACM |

## The gateway cannot run in AWS

It needs a signed-in macOS Messages account, so it lives on a Mac: a Mac mini
on-prem, MacStadium, or an EC2 `mac2.metal` instance.

This is where the transport decision pays off. Because the gateway **dials out**,
it works from anywhere with outbound HTTPS — no inbound security-group rules, no
VPN, no public IP, no port forwarding. The pull-based design chosen for local
simplicity is precisely what makes the production topology trivial.

Had the server needed to push to the gateway, deploying this would require
exposing a laptop to the internet.

## Running multiple server instances

Already safe. `FOR UPDATE SKIP LOCKED` plus the persisted-timestamp rate gate
means concurrent tickers cannot both win the same slot, so no leader election is
required. Advisory locks or an EventBridge-triggered singleton are alternatives,
not necessities.

## What would change at real scale

- Many gateways across many Macs → competing consumers, which the pull model
  already supports; add per-gateway API keys and route by capability.
- Thousands of messages/hour → revisit the broker question
  ([ADR 0002](../adr/0002-no-message-broker.md)); a transactional outbox becomes
  necessary at that point.
- Per-recipient rate limiting and quiet hours → new `RateLimiter` implementations.
