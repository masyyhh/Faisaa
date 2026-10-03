# ============================================================================
# Stage 1: Build React Frontend (Vite + Tailwind v4)
# ============================================================================
FROM node:22-alpine AS client-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# ============================================================================
# Stage 2: Production Server + Static SPA Bundle
# ============================================================================
FROM node:22-alpine AS production
WORKDIR /app

# OpenSSL is required by Prisma Query Engine on Alpine Linux
RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=5001

# Install server dependencies
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci

# Copy server source & Prisma schema
COPY server/ ./

# Optional build arg to choose Prisma DB provider ("sqlite" or "postgresql")
ARG DB_PROVIDER=postgresql
RUN sed -i "s/provider = \"sqlite\"/provider = \"${DB_PROVIDER}\"/g" prisma/schema.prisma && \
    npx prisma generate && \
    npm run build

# Copy compiled frontend assets from Stage 1
COPY --from=client-builder /app/client/dist /app/client/dist

# Ensure non-root ownership for runtime security
RUN mkdir -p /app/server/prisma && chown -R node:node /app
USER node

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5001/api/health || exit 1

CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
