#!/usr/bin/env bash
# Bootstrap the builder machine — run ONCE per environment.
# Expects flyctl logged in against the owner account for clear-apps-*.

set -euo pipefail

cd "$(dirname "$0")"

if [ -z "${FLY_API_TOKEN_01:-}" ] || [ -z "${FLY_API_TOKEN_02:-}" ] || [ -z "${FLY_API_TOKEN_03:-}" ]; then
  echo "FLY_API_TOKEN_01..03 must be set (one per shard org)" >&2
  exit 1
fi

SECRET="${BUILDER_SHARED_SECRET:-$(openssl rand -hex 32)}"
echo "Generated BUILDER_SHARED_SECRET: $SECRET"
echo "Store this in Studio's Vercel env as BUILDER_SHARED_SECRET."

flyctl launch --no-deploy --copy-config --name clear-deploy-builder --org clear-apps-01 || true
flyctl secrets set \
  FLY_API_TOKEN_01="$FLY_API_TOKEN_01" \
  FLY_API_TOKEN_02="$FLY_API_TOKEN_02" \
  FLY_API_TOKEN_03="$FLY_API_TOKEN_03" \
  BUILDER_SHARED_SECRET="$SECRET" \
  --app clear-deploy-builder

flyctl deploy --app clear-deploy-builder
echo "Builder live at https://clear-deploy-builder.fly.dev"
