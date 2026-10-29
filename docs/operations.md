# Operations: backups and a secure demo deployment

For the runnable server configuration and first administrator setup, follow
[deployment.md](deployment.md). Use `COMPOSE_FILE=compose.server.yml` before the commands
below when operating that server stack.

## Backups (SRS §7)

```bash
scripts/backup.sh                                     # -> backups/biletflow-<date>.dump
scripts/restore.sh backups/biletflow-<date>.dump      # replaces the whole database
```

The scripts run `pg_dump` / `pg_restore` inside the `db` container, so nothing needs to be
installed. On Windows, run them from Git Bash or WSL. `backups/` is ignored by git.

- **Regular backups:** on the demo server, schedule the script, for example daily at 03:00
  with `crontab -e`: `0 3 * * * cd /path/to/ticketflow && scripts/backup.sh`.
  Copy the files off the server (another disk or cloud storage) and delete old ones.
- **Recovery:** `scripts/restore.sh <file>` stops the API, restores, and starts it again.
  Test a restore before the demo, not during it.
- A backup made with an older `schema.sql` restores fine, but the API then refuses to start
  until the schema matches (see `docs/database.md`).

## Running a demo deployment securely (SRS §7)

`docker-compose.yml` is made for development. On a server that other people can reach:

1. **Secrets:** set long random `JWT_SECRET` and `QR_SECRET` in `.env` (never commit it).
   Changing `QR_SECRET` invalidates every issued ticket QR, so set it once.
2. **Encryption in transit:** use `compose.server.yml`; its Caddy configuration serves both
   the web app and API on one HTTPS domain and obtains certificates automatically.
3. **Encryption at rest:** keep the database volume on an encrypted disk (most cloud VMs
   encrypt disks by default) or use a managed PostgreSQL with encryption turned on. Keep
   backup files on encrypted storage too.
4. **Close what users don't need:** the server compose publishes only HTTP/HTTPS. Set real
   SMTP credentials and STARTTLS/SSL options in `.env`; Mailpit is development-only.
5. **No demo accounts:** set `SEED_DEMO_DATA=false` unless the server is only for the demo.
6. **No live reload:** the server uses the runtime API image without development mounts.

## What the backend already protects

- Passwords: Argon2 hashes. Refresh tokens and email links: stored only as SHA-256 hashes.
- No payment-card data is ever received or stored; payments are simulated (§7).
- Ticket QR codes are HMAC-signed, so they cannot be forged.
- Every organizer and admin action that matters is in the append-only `audit_log`.
