#!/usr/bin/env bash
# Creates local development and test databases, applies migrations, loads the
# exercise library and gives the fito_app role a password. Safe to re-run. Assumes a local Postgres superuser "postgres"
# reachable on localhost:5432 without a password (adjust PG* vars if needed).
set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
APP_PASSWORD="${FITO_APP_DB_PASSWORD:-fito_app_local}"

for db in fito fito_test; do
  if ! psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1; then
    createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$db"
    echo "Created database $db"
  fi
  DATABASE_ADMIN_URL="postgres://$PGUSER@$PGHOST:$PGPORT/$db" npx tsx scripts/migrate.ts
  DATABASE_ADMIN_URL="postgres://$PGUSER@$PGHOST:$PGPORT/$db" npx tsx scripts/seed-exercises.ts
done

psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d fito -v ON_ERROR_STOP=1 \
  -c "ALTER ROLE fito_app WITH LOGIN PASSWORD '$APP_PASSWORD'" >/dev/null
echo "fito_app can now log in. Use in .env.local:"
echo "  DATABASE_URL=postgres://fito_app:$APP_PASSWORD@$PGHOST:$PGPORT/fito"
echo "  DATABASE_ADMIN_URL=postgres://$PGUSER@$PGHOST:$PGPORT/fito"
