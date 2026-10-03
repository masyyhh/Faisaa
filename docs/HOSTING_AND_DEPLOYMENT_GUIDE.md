# Faisaa — Complete Production Hosting & Deployment Guide

This document provides end-to-end instructions for deploying and hosting **Faisaa (finva)** in production.

---

## 1. System Architecture Overview

```
                        ┌──────────────────────────────────────────────┐
                        │              Internet / Clients              │
                        └──────────────────────┬───────────────────────┘
                                               │ HTTPS (443) / HTTP (80)
                                               ▼
                        ┌──────────────────────────────────────────────┐
                        │      Reverse Proxy (Caddy / Nginx / Traefik)  │
                        │        - Automated Let's Encrypt TLS 1.3     │
                        │        - Static Asset Compression (Brotli/Gz)│
                        │        - Rate Limiting & SSL Termination     │
                        └──────────────────────┬───────────────────────┘
                                               │ Reverse Proxy (HTTP 5001)
                                               ▼
                        ┌──────────────────────────────────────────────┐
                        │          Faisaa Application Container        │
                        │  ┌────────────────────┬────────────────────┐ │
                        │  │ Express REST API   │ React SPA Frontend │ │
                        │  │ (Node.js 22 LTS)   │ (Vite + Tailwind)  │ │
                        │  └────────────────────┴────────────────────┘ │
                        │       - AES-256-GCM Sensitive Token Cipher  │
                        │       - Prisma ORM Query Engine              │
                        └──────────────────────┬───────────────────────┘
                                               │ TCP / UNIX Socket (5432)
                                               ▼
                        ┌──────────────────────────────────────────────┐
                        │          PostgreSQL 16+ Database             │
                        │    - Encrypted Storage (LUKS / AWS KMS)     │
                        │    - Daily Automated pg_dump Backups         │
                        └──────────────────────────────────────────────┘
```

Faisaa is compiled as a unified single-port application:
- **Frontend**: Vite React SPA compiled into optimized static assets (`client/dist`).
- **Backend**: Express REST API compiled with TypeScript (`server/dist`).
- **Static Serving**: In production (`NODE_ENV=production`), Express automatically serves the frontend bundle from `client/dist` with 1-year immutable caching on hashed assets and SPA fallback routing on `PORT` (`5001`).

---

## 2. Server Sizing & Prerequisites

### Minimum Hardware
- **CPU**: 1 vCPU (2 vCPUs recommended)
- **RAM**: 1 GB minimum (2 GB recommended for Docker + PostgreSQL)
- **Disk**: 20 GB SSD (NVMe preferred)
- **OS**: Ubuntu 22.04 LTS / 24.04 LTS, Debian 12, or AlmaLinux 9

### Network & DNS
- Point an `A` record from your domain (e.g. `faisaa.yourdomain.com`) to your server's public IPv4 address.
- Open firewall ports:
  - `80/tcp` (HTTP — redirected to HTTPS / ACME challenges)
  - `443/tcp` (HTTPS — secure client traffic)
  - `22/tcp` (SSH management)

---

## 3. Cryptographic Keys Generation

Before launching, generate two strong 256-bit cryptographically random keys on your local machine or server using OpenSSL:

```bash
# Generate JWT_SECRET
openssl rand -hex 32

# Generate ENCRYPTION_KEY
openssl rand -hex 32
```

> [!IMPORTANT]
> - `ENCRYPTION_KEY` is strictly required to be at least 32 bytes (or 64 hexadecimal characters). It encrypts sensitive tokens (such as Telegram bot credentials) at rest using AES-256-GCM.
> - **Never lose or change `ENCRYPTION_KEY`** after initializing your database; doing so will make existing encrypted credentials unreadable.

---

## 4. Method 1: Docker Compose + Caddy (Recommended)

This method provides automated zero-maintenance HTTPS certificates, healthchecks, and database isolation.

### Step 1: Install Docker & Docker Compose
On Ubuntu / Debian:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker
```

### Step 2: Clone the Repository & Configure `.env`
```bash
git clone https://github.com/masyyhh/Faisaa.git /opt/faisaa
cd /opt/faisaa
```

Create your production environment file `.env`:
```bash
cp .env.example .env
nano .env
```

Set the production variables:
```env
NODE_ENV="production"
PORT=5001

# PostgreSQL Settings
POSTGRES_USER="faisaa"
POSTGRES_PASSWORD="generate_a_strong_db_password"
POSTGRES_DB="faisaa"

# Security & Authentication (paste your openssl keys)
JWT_SECRET="<your-64-char-hex-jwt-secret>"
ENCRYPTION_KEY="<your-64-char-hex-encryption-key>"
JWT_EXPIRES_IN="7d"

# Domain URL for CORS & redirects (no trailing slash)
CLIENT_URL="https://faisaa.yourdomain.com"

# Disable demo account auto-seeding
SEED_DEMO="false"

# Optional Telegram notifications
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""
```

### Step 3: Production Docker Compose Setup with Caddy
Create `docker-compose.prod.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: faisaa-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-faisaa}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Database password required}
      POSTGRES_DB: ${POSTGRES_DB:-faisaa}
    volumes:
      - faisaa_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER:-faisaa} -d ${POSTGRES_DB:-faisaa}']
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - faisaa_net

  faisaa:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        DB_PROVIDER: postgresql
    container_name: faisaa-app
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 5001
      DATABASE_URL: postgresql://${POSTGRES_USER:-faisaa}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-faisaa}?schema=public
      JWT_SECRET: ${JWT_SECRET:?JWT_SECRET required}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY:?ENCRYPTION_KEY required}
      JWT_EXPIRES_IN: ${JWT_EXPIRES_IN:-7d}
      CLIENT_URL: ${CLIENT_URL:?CLIENT_URL required}
      SEED_DEMO: ${SEED_DEMO:-false}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:-}
      TELEGRAM_CHAT_ID: ${TELEGRAM_CHAT_ID:-}
    networks:
      - faisaa_net

  caddy:
    image: caddy:2-alpine
    container_name: faisaa-caddy
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - faisaa
    networks:
      - faisaa_net

networks:
  faisaa_net:
    driver: bridge

volumes:
  faisaa_pgdata:
  caddy_data:
  caddy_config:
```

### Step 4: Create Caddyfile
Create `Caddyfile` in the project root:
```caddy
faisaa.yourdomain.com {
    encode zstd gzip

    reverse_proxy faisaa:5001 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```

### Step 5: Start the Application Stack
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Check status:
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f faisaa
```

Caddy will automatically fetch a valid Let's Encrypt SSL certificate and bind HTTPS.

---

## 5. Method 2: Ubuntu / Debian Host with Nginx + PM2

If you prefer running directly on the host operating system without Docker:

### Step 1: Install Node.js 22 LTS & PostgreSQL 16
```bash
# 1. Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql postgresql-contrib nginx certbot python3-certbot-nginx

# 2. Verify versions
node -v    # v22.x
npm -v
psql --version
```

### Step 2: Configure PostgreSQL Database
```bash
sudo -u postgres psql
```
In the PostgreSQL prompt:
```sql
CREATE DATABASE faisaa;
CREATE USER faisaa WITH ENCRYPTED PASSWORD 'generate_a_strong_password';
GRANT ALL PRIVILEGES ON DATABASE faisaa TO faisaa;
\q
```

### Step 3: Install Dependencies & Build
```bash
git clone https://github.com/masyyhh/Faisaa.git /var/www/faisaa
cd /var/www/faisaa

# Switch Prisma to PostgreSQL provider
npm run db:postgres

# Install all root, server, and client dependencies
npm run postinstall

# Build client SPA and server TypeScript
npm run build
```

### Step 4: Configure `server/.env`
```bash
cat << 'EOF' > server/.env
NODE_ENV="production"
PORT=5001
DATABASE_URL="postgresql://faisaa:generate_a_strong_password@localhost:5432/faisaa?schema=public"
POSTGRES_DATABASE_URL="postgresql://faisaa:generate_a_strong_password@localhost:5432/faisaa?schema=public"

JWT_SECRET="<openssl rand -hex 32>"
ENCRYPTION_KEY="<openssl rand -hex 32>"
JWT_EXPIRES_IN="7d"

CLIENT_URL="https://faisaa.yourdomain.com"
SEED_DEMO="false"
EOF
```

Push database schema:
```bash
npm run prisma:push
```

### Step 5: Process Management with PM2
Install PM2 globally and launch:
```bash
sudo npm install -g pm2
pm2 start dist/index.js --name faisaa --cwd /var/www/faisaa/server
pm2 save
pm2 startup
```

### Step 6: Configure Nginx & SSL
Create `/etc/nginx/sites-available/faisaa`:
```nginx
server {
    server_name faisaa.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 10M;
    }
}
```

Enable site and acquire SSL certificate:
```bash
sudo ln -s /etc/nginx/sites-available/faisaa /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx -d faisaa.yourdomain.com
```

---

## 6. Method 3: Cloud Platforms (Railway / Render / Coolify)

### Railway
1. **New Project** -> Deploy from GitHub repo.
2. Add a **PostgreSQL** service in Railway.
3. Add Environment Variables in the web service:
   - `NODE_ENV`: `production`
   - `PORT`: `5001`
   - `DATABASE_URL`: `${{Postgres.DATABASE_URL}}`
   - `JWT_SECRET`: *(Generated 32-byte secret)*
   - `ENCRYPTION_KEY`: *(Generated 32-byte secret)*
   - `CLIENT_URL`: `https://${{RAILWAY_PUBLIC_DOMAIN}}`
   - `SEED_DEMO`: `false`
4. Build Command: `npm run db:postgres && npm run build`
5. Start Command: `npm start`

### Render
1. Create a **Web Service** pointing to your repository.
2. Select **Node** environment.
3. Build Command: `npm run db:postgres && npm run build`
4. Start Command: `npm start`
5. Create a **Managed PostgreSQL** database on Render and paste its Internal Database URL into `DATABASE_URL`.
6. Add `JWT_SECRET` and `ENCRYPTION_KEY` under Environment Variables.

---

## 7. Environment Variables Reference

| Variable | Required | Description | Example |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | Runtime environment mode | `production` |
| `PORT` | Yes | Server listen port | `5001` |
| `DATABASE_URL` | Yes | Active Prisma DB connection string | `postgresql://user:pass@host:5432/db?schema=public` |
| `POSTGRES_DATABASE_URL`| Yes | Target PostgreSQL connection string | `postgresql://user:pass@host:5432/db?schema=public` |
| `JWT_SECRET` | Yes | 256-bit secret for signing user tokens | Minimum 32 characters or 64 hex chars |
| `ENCRYPTION_KEY` | Yes | 256-bit key for AES-256-GCM token storage | Minimum 32 bytes or 64 hex chars |
| `JWT_EXPIRES_IN` | No | JWT access token validity | `7d` (default) |
| `CLIENT_URL` | Yes | Allowed CORS origin and public URL | `https://faisaa.yourdomain.com` |
| `SEED_DEMO` | No | Auto-seed demo account on startup | `false` (recommended for production) |
| `TELEGRAM_BOT_TOKEN` | No | Optional global bot token for alerts | `123456789:ABCDefGh...` |
| `TELEGRAM_CHAT_ID` | No | Optional global admin Telegram chat ID | `12345678` |

---

## 8. Backup, Restore & Maintenance Operations

### Automated Daily PostgreSQL Backups
Add a cron job to dump the database daily at 02:00 AM:
```bash
sudo crontab -e
```
Add the following line:
```cron
0 2 * * * docker exec faisaa-postgres pg_dump -U faisaa faisaa | gzip > /opt/backups/faisaa_$(date +\%F).sql.gz
```

### Database Restore Procedure
To restore from a backup:
```bash
gunzip -c /opt/backups/faisaa_2026-10-03.sql.gz | docker exec -i faisaa-postgres psql -U faisaa faisaa
```

### Healthcheck Monitoring
Faisaa provides a dedicated `/api/health` endpoint:
```bash
curl -I https://faisaa.yourdomain.com/api/health
```
Response:
```json
{
  "status": "healthy",
  "environment": "production",
  "uptime": 10423.82,
  "timestamp": "2026-10-03T16:59:00.000Z",
  "database": "connected"
}
```

---

## 9. Security Hardening Checklist

- [ ] `ENCRYPTION_KEY` is set to a 64-character hex string generated with `openssl rand -hex 32`.
- [ ] `JWT_SECRET` is set to a 64-character hex string generated with `openssl rand -hex 32`.
- [ ] `SEED_DEMO="false"` is set to prevent sample accounts from seeding.
- [ ] Direct database port `5432` is firewalled and **never** exposed to the public internet.
- [ ] HTTPS is enforced with TLS 1.3 and HSTS headers.
- [ ] Healthcheck endpoint `/api/health` is connected to your uptime monitoring service (e.g. UptimeRobot, BetterStack).
- [ ] Regular automated off-site backups are scheduled and tested.
