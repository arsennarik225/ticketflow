#!/usr/bin/env bash
# Back up the BiletFlow database to backups/biletflow-<date>.dump (PostgreSQL custom format).
# Usage: scripts/backup.sh        (the stack must be running: docker compose up -d)
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p backups
file="backups/biletflow-$(date +%Y%m%d-%H%M%S).dump"
docker compose exec -T db pg_dump -U biletflow -d biletflow --format=custom --file=/tmp/backup.dump
docker compose cp db:/tmp/backup.dump "$file"
docker compose exec -T db rm /tmp/backup.dump
echo "Saved $file"
