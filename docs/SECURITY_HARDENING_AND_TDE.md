# Faisaa Financial Security Architecture & Production Hardening Guide

This document specifies the enterprise security architecture for **Faisaa**, covering Transparent Data Encryption (TDE), column-level tokenization, TLS 1.3 reverse proxies, and session management.

---

## 1. Storage & Database Encryption at Rest (TDE / LUKS / EBS)

Because local SQLite files lack native at-rest filesystem encryption, **SQLite is deprecated for production deployments**. Production environments strictly require **PostgreSQL 16+** with underlying storage encryption.

### Option A: AWS RDS PostgreSQL with AWS KMS (Recommended Cloud Architecture)
- **Engine**: PostgreSQL 16+
- **Encryption**: Enable AWS KMS Customer Managed Key (CMK) or AWS-managed KMS key (`aws/rds`).
- **Algorithm**: AES-256 block cipher hardware-accelerated.
- **Coverage**: Database tables, indexes, write-ahead logs (WAL), automated snapshots, and read replicas are encrypted transparently at the storage layer without application latency.

### Option B: Self-Hosted / On-Premise Linux with LUKS (dm-crypt)
For on-premise or bare-metal VPS deployments (Ubuntu/Debian):
1. **Initialize LUKS Encrypted Partition**:
   ```bash
   cryptsetup luksFormat --type luks2 --cipher aes-xts-plain64 --key-size 512 --hash sha512 /dev/sdb1
   cryptsetup open /dev/sdb1 faisaa_encrypted_data
   mkfs.ext4 /dev/mapper/faisaa_encrypted_data
   ```
2. **Mount for PostgreSQL Data Directory**:
   ```bash
   mkdir -p /var/lib/postgresql/16/main
   mount /dev/mapper/faisaa_encrypted_data /var/lib/postgresql/16/main
   chown -R postgres:postgres /var/lib/postgresql/16/main
   ```

### Option C: AWS EBS Encrypted Volumes (Docker / EC2 Deployments)
- Enable default encryption for the AWS Region with an KMS CMK.
- Ensure Docker volume mounts for PostgreSQL data (`faisaa-postgres`) reside on an encrypted EBS volume.

---

## 2. Sensitive Credential Encryption at Rest (AES-256-GCM)

All third-party credentials (such as `telegramBotToken` and API secrets) are encrypted before writing to the database using **AES-256-GCM** via [`server/src/utils/crypto.js`](../server/src/utils/crypto.js).

- **Payload format**: `iv:authTag:ciphertext`
- **Key Derivation**: SHA-256 hash of `process.env.ENCRYPTION_KEY`
- **Integrity**: Authenticated Galois/Counter Mode (GCM) with 16-byte authentication tags prevents tampering or bit-flipping attacks.
- **API Response Masking**: Sensitive tokens returned over the wire are masked (`8854737122:•••••••••••••••••••••••••••••••••••`).

---

## 3. Financial Ledger Masking & Tokenization (PCI-DSS Compliance)

- **Account Numbers**: Raw bank account numbers are never retained in full. The system applies `sanitizeLastFour()` to strip all non-digits and preserve only the last 4 digits (`lastFour: '1001'`).
- **Payees & Descriptions**: Logged transaction details undergo input sanitization.
- **Audit Logging**: User sessions, refresh token rotations, and webhook requests are monitored for anomalous replay attempts.

---

## 4. Session & Dual-Token Architecture

| Token | Lifetime | Storage | Flags |
| :--- | :--- | :--- | :--- |
| **Access Token** | 15 Minutes | `faisaa_access_token` Cookie | `HttpOnly`, `Secure` (in prod), `SameSite=Strict`, `Path=/` |
| **Rotating Refresh Token** | 7 Days | `faisaa_refresh_token` Cookie | `HttpOnly`, `Secure` (in prod), `SameSite=Strict`, `Path=/` |

### Token Reuse & Replay Detection
1. Refresh tokens are stored in the database hashed with SHA-256 (`tokenHash`).
2. When a refresh token is exchanged, it is marked as `revokedAt: new Date()` and assigned a `replacedByTokenHash`.
3. If an attacker attempts to replay an old/revoked refresh token, **all active refresh sessions for that user account are revoked immediately**, locking out the attacker and alerting the user.

---

## 5. Network & Transport Security (TLS 1.3)

### Nginx Production Configuration Snippet
Place in `/etc/nginx/conf.d/faisaa.conf`:

```nginx
# Upstream application
upstream faisaa_app {
    server 127.0.0.1:5001;
    keepalive 32;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name faisaa.yourdomain.com;
    return 301 https://$host$request_uri;
}

# HTTPS Server terminating TLS 1.3
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name faisaa.yourdomain.com;

    # SSL Certificates (Let's Encrypt / Certbot)
    ssl_certificate /etc/letsencrypt/live/faisaa.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/faisaa.yourdomain.com/privkey.pem;

    # Strict TLS Configuration (Mozilla Intermediate / Modern profile)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;

    # HSTS & Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Proxy Pass to Node.js / Express
    location / {
        proxy_pass http://faisaa_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_buffering off;
    }
}
```

### Caddy Alternative (Automatic TLS 1.3)
In `/etc/caddy/Caddyfile`:

```caddy
faisaa.yourdomain.com {
    tls {
        protocols tls1.2 tls1.3
    }

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    reverse_proxy 127.0.0.1:5001 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-Proto https
    }
}
```
