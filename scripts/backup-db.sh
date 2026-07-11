#!/usr/bin/env bash
# OPS-1 T5 — full-database backup (public schema + every tenant schema).
#
# Usage:
#   scripts/backup-db.sh [target-dir]
#
# Env:
#   DATABASE_URL   connection string; defaults to the one in apps/api/.env
#   BACKUP_KEEP    optional: keep only the N most recent dumps in target-dir
#
# Output: <target-dir>/aaramva-YYYYMMDD-HHMMSS.dump  (pg_dump custom format,
# which supports full restore AND selective --schema restore — see
# docs/ops/RUNBOOK.md). Default target-dir: ./backups (gitignored).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-$REPO_ROOT/backups}"
mkdir -p "$TARGET_DIR"

if [ -z "${DATABASE_URL:-}" ]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' "$REPO_ROOT/apps/api/.env" | sed -E 's/^DATABASE_URL="?([^"?]*).*$/\1/')
fi
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL not set and not found in apps/api/.env" >&2
  exit 1
fi

PG_DUMP="pg_dump"
command -v pg_dump >/dev/null 2>&1 || PG_DUMP="/c/Program Files/PostgreSQL/17/bin/pg_dump"

STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$TARGET_DIR/aaramva-$STAMP.dump"

"$PG_DUMP" "$DATABASE_URL" --format=custom --file="$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
echo "backup written: $OUT ($SIZE)"

# Optional retention: keep the N most recent dumps.
if [ -n "${BACKUP_KEEP:-}" ]; then
  ls -1t "$TARGET_DIR"/aaramva-*.dump 2>/dev/null | tail -n "+$((BACKUP_KEEP + 1))" | while read -r old; do
    rm -f "$old"
    echo "pruned: $old"
  done
fi
