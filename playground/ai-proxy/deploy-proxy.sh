#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

: "${ANTHROPIC_API_KEY:?required}"
: "${TENANT_JWT_SECRET:?required}"
: "${PROXY_SHARED_SECRET:?required}"
: "${DATABASE_URL:?required (Postgres URL for tenants table)}"

flyctl launch --no-deploy --copy-config --name clear-ai-proxy --org clear-apps-01 || true
flyctl secrets set \
  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  TENANT_JWT_SECRET="$TENANT_JWT_SECRET" \
  PROXY_SHARED_SECRET="$PROXY_SHARED_SECRET" \
  DATABASE_URL="$DATABASE_URL" \
  --app clear-ai-proxy
flyctl deploy --app clear-ai-proxy
echo "Proxy live at https://clear-ai-proxy.fly.dev"
