#!/usr/bin/env bash
# Restore a backup made by scripts/backup.sh. This REPLACES everything in the database.
# Usage: scripts/restore.sh backups/biletflow-20261001-120000.dump
set -euo pipefail
file="$(cd "$(dirname "${1:?usage: scripts/restore.sh <backup file>}")" && pwd)/$(basename "$1")"
cd "$(dirname "$0")/.."

docker compose stop api
docker compose cp "$file" db:/tmp/restore.dump
docker compose exec -T db pg_restore -U biletflow -d biletflow --clean --if-exists --no-owner /tmp/restore.dump
docker compose exec -T db rm /tmp/restore.dump
docker compose start api
echo "Restored $file"
