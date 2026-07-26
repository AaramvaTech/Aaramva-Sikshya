#!/usr/bin/env bash
# BILL-0 — disposable tenant_bill_scratch schema for money-hardening tests
# and live round-trip proofs (R15: no real tenant's finance tables are
# truncated or otherwise touched by Phase 1 work).
#
# Applies every apps/api/migrations/tenant/NNNN_*.sql file in order against a
# schema with no corresponding public.tenants row — deliberately NOT a real
# tenant, so it never appears in tenant listings, the super-admin UI, or
# `migrate:tenants --status`. Bypasses TenantMigrationService's ledger (which
# resolves schemas from public.tenants) rather than fabricating a fake tenant
# row that would have to be cleaned up separately.
#
# Usage:
#   scripts/bill-scratch-schema.sh create   # create + apply all migrations
#   scripts/bill-scratch-schema.sh drop     # drop the schema entirely
#   scripts/bill-scratch-schema.sh recreate # drop then create (idempotent reset)
#
# Env:
#   DATABASE_URL   connection string; defaults to the one in apps/api/.env
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA="tenant_bill_scratch"
MIGRATIONS_DIR="$REPO_ROOT/apps/api/migrations/tenant"

if [ -z "${DATABASE_URL:-}" ]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' "$REPO_ROOT/apps/api/.env" | sed -E 's/^DATABASE_URL="?([^"?]*).*$/\1/')
fi
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL not set and not found in apps/api/.env" >&2
  exit 1
fi

PSQL="psql"
command -v psql >/dev/null 2>&1 || PSQL="/c/Program Files/PostgreSQL/17/bin/psql"

drop_schema() {
  "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS $SCHEMA CASCADE;"
  echo "dropped schema $SCHEMA"
}

create_schema() {
  "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE SCHEMA $SCHEMA;"

  for file in "$MIGRATIONS_DIR"/[0-9][0-9][0-9][0-9]_*.sql; do
    name="$(basename "$file")"
    # Every migration is applied with search_path pointed at the scratch
    # schema (matches TenantMigrationService's own convention); files that
    # additionally use the {{schema}} placeholder (0005+) get it substituted.
    { echo "SET search_path TO $SCHEMA, public;"; sed "s/{{schema}}/$SCHEMA/g" "$file"; } \
      | "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -f - >/dev/null
    echo "applied $name"
  done
  echo "schema $SCHEMA ready ($(basename "$(ls "$MIGRATIONS_DIR"/[0-9][0-9][0-9][0-9]_*.sql | tail -1)"))"
}

case "${1:-}" in
  create) create_schema ;;
  drop) drop_schema ;;
  recreate) drop_schema; create_schema ;;
  *)
    echo "Usage: $0 {create|drop|recreate}" >&2
    exit 1
    ;;
esac
