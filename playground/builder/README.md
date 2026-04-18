# Clear Deploy Builder

The always-on Fly machine that turns Clear source into live URLs.

## What it does

- Accepts a tarball + metadata at `POST /build`
- Validates the tarball (zip-slip defense, size cap, typeflag whitelist)
- Runs `docker build` + `docker push registry.fly.io/<app>:<sha>` in a scoped tempdir
- Calls `flyctl` to create the app (first deploy), set secrets, create a volume for SQLite apps or attach Postgres, then deploy the image
- Supports shard failover: if the tenant's primary Fly org is at quota, walks forward through the other shards
- Issues custom-domain certs at `POST /cert`
- Rolls back at `POST /rollback`
- Lists releases at `GET /releases/:app`
- Destroys apps at `POST /destroy` (used for cancellation)

## Why its own service

A Vercel function can't run Docker (no daemon, 10–60s timeout). Fly's Machines
API can't build images — it wants pre-built images at a registry URL. The
builder fills the gap. It lives inside the Fly network so registry + Machines
API calls are cheap and don't need WireGuard.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | liveness + inflight counters |
| POST | `/build` | build + deploy; returns `{ jobId }` — poll `/status/:jobId` |
| GET | `/status/:jobId` | poll deploy status |
| POST | `/cert` | issue custom-domain cert |
| POST | `/rollback` | roll back to a prior release |
| GET | `/releases/:app` | last 10 releases |
| POST | `/destroy` | tear down app + volume (+ Postgres) |

All endpoints except `/health` require `Authorization: Bearer <BUILDER_SHARED_SECRET>`.

## Request headers for `/build`

- `Authorization: Bearer <secret>`
- `x-tenant-slug: <slug>` (required)
- `x-app-slug: <slug>` (required)
- `x-app-name: <existing name>` (optional — for re-deploys)
- `x-db-backend: sqlite | postgresql`
- `x-region: iad` (default)
- `x-secrets: <base64 JSON object>` — secrets to set as Fly secrets before deploy

Body is the raw tarball (gzipped or plain).

## Deploying the builder

Once per environment:

```bash
cd playground/builder
FLY_API_TOKEN_01=xxx FLY_API_TOKEN_02=yyy FLY_API_TOKEN_03=zzz \
  ./deploy-builder.sh
```

Rotate the shared secret and `FLY_API_TOKEN_*` every 90 days.

## Running tests

```bash
node playground/builder/server.test.js
```

Tests use `setRunCmdMock` to stub `docker`/`flyctl`. No real Fly or Docker
is invoked in unit tests.
