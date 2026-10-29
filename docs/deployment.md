# Deployment

Use **one Linux server with Docker Compose**, a domain, and an SMTP account. The web app
is static files served by Caddy; Caddy also proxies `/v1` to FastAPI. PostgreSQL stays on
the private Docker network. No Kubernetes, separate frontend platform, or app-store
publication is needed for the academic demo.

## Local demo

```bash
docker compose up -d --build
```

Web: http://localhost:3000 · API docs: http://localhost:8000/docs · Mail: http://localhost:8025.
The first start seeds demo accounts only when the database is empty. Existing data is
preserved; old demo event dates are not advanced automatically.

## Server setup

1. Install Docker Engine with the Compose plugin. Copy this repository to the server.
2. Point the domain's DNS A record (and AAAA only if IPv6 works) at the server. Allow
   incoming TCP 80/443; keep PostgreSQL, API port 8000, and Mailpit private.
3. Copy `deploy/.env.example` to the repository root as `.env`. Set the real domain and
   SMTP values. Generate DB_PASSWORD, JWT_SECRET, and QR_SECRET **separately** with
   `openssl rand -hex 32`. Use hex for DB_PASSWORD so the database URL needs no escaping.
4. Use STARTTLS on SMTP port 587, or set SMTP_SSL=true and SMTP_STARTTLS=false for port
   465. Use a sender permitted by your SMTP provider. Keep `.env` private.
5. Start the standalone server configuration:

   ```bash
   docker compose -f compose.server.yml config --quiet
   docker compose -f compose.server.yml up -d --build
   docker compose -f compose.server.yml ps
   ```

6. Open `https://YOUR_DOMAIN/health` and the web app. Caddy obtains HTTPS certificates
   automatically once DNS and ports work. Register, verify an email, and test actual mail
   delivery, a simulated order, a PDF download, and scanner access from a phone.
7. Register/verify the first administrator through the web app, then promote that account:

   ```bash
   docker compose -f compose.server.yml exec api python -m app.admin admin@example.kz
   ```

SEED_DEMO_DATA defaults to false. Set it true **before the first start** only for a public
academic demonstration where the known demo passwords are intentional. Payments always
remain simulations. Set the scanner's API URL to `https://YOUR_DOMAIN/v1`.

## Updates, backup, recovery

Keep PostgreSQL on encrypted server storage and store backups on encrypted storage off the
server. Preserve QR_SECRET: changing it invalidates existing ticket QR signatures.

```bash
# Update code on the server, then rebuild. Database and certificates use named volumes.
docker compose -f compose.server.yml up -d --build

# COMPOSE_FILE selects the same server stack for the shared backup/restore scripts.
COMPOSE_FILE=compose.server.yml scripts/backup.sh
COMPOSE_FILE=compose.server.yml scripts/restore.sh backups/FILE.dump
```

Schedule backups daily and test recovery on a separate deployment. Restore stops the API
and replaces the database in a transaction; a failed restore leaves the API stopped for
inspection. Never use `docker compose down -v` on a server holding data you need.
The API applies pending SQL migrations at startup without resetting data. Follow
`docs/database.md`: add a new migration, keep `schema.sql` and models synchronized, and
never edit an existing migration or the frozen baseline.

Use `docker compose -f compose.server.yml logs -f api web` for troubleshooting. If mail
fails, the API logs it and keeps the notification record; fix SMTP and repeat the affected
verification/reset request. Ticket PDFs remain available in a verified buyer's account.
