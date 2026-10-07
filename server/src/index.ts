import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Server } from 'http';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import apiRoutes from './routes/api.js';
import { errorHandler } from './middleware/auth.js';
import { seedDatabase } from './prisma/seed.js';
import prisma, { initDatabasePragmas } from './prisma/client.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 5001;
const isProduction = process.env.NODE_ENV === 'production';

// Trust reverse proxy (Nginx, Cloudflare, Render, Railway, Fly.io, AWS ALB)
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Cookie Parser Middleware (Zero external dependencies)
app.use((req: Request, _res: Response, next: NextFunction) => {
  const cookieHeader = req.headers.cookie;
  req.cookies = {};
  if (cookieHeader) {
    cookieHeader.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      const name = parts[0]?.trim();
      const val = parts.slice(1).join('=').trim();
      if (name) {
        try {
          req.cookies![name] = decodeURIComponent(val);
        } catch {
          req.cookies![name] = val;
        }
      }
    });
  }
  next();
});

app.use(
  helmet({
    frameguard: { action: 'deny' },
    crossOriginResourcePolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'", 'https://api.telegram.org'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
  })
);

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5001',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5001',
];

const configuredOrigins = (process.env.CLIENT_URL || process.env.FRONTEND_URL || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...defaultOrigins, ...configuredOrigins]));

app.use(
  cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server, or same-origin SPA)
      if (!origin) return callback(null, true);
      // In development mode, allow any local or forwarded development origin
      if (!isProduction) return callback(null, true);
      // In production mode, strictly require allowed origin
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Blocked by CORS policy'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '2mb' }));

// Strict rate limiter for authentication endpoints (prevent brute-force and credential stuffing)
const authBruteForceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
  },
});
app.use('/api/auth/login', authBruteForceLimiter);
app.use('/api/auth/register', authBruteForceLimiter);
app.use('/api/auth/forgot-password', authBruteForceLimiter);
app.use('/api/auth/reset-password', authBruteForceLimiter);

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Mount REST API routes
app.use('/api', apiRoutes);

// Catch-all 404 for unknown /api/* endpoints
app.use('/api/*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// Serve built React SPA from client/dist if available
const clientDistPath = path.resolve(__dirname, '../../client/dist');
const clientIndexHtml = path.join(clientDistPath, 'index.html');

if (fs.existsSync(clientIndexHtml)) {
  app.use(
    '/assets',
    express.static(path.join(clientDistPath, 'assets'), {
      maxAge: '1y',
      immutable: true,
    })
  );

  app.use(
    express.static(clientDistPath, {
      index: false,
      maxAge: '1h',
    })
  );

  app.get('*', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(clientIndexHtml);
  });
}

app.use(errorHandler);

let server: Server | undefined;

async function startServer() {
  try {
    const dbUrl = (process.env.DATABASE_URL || '').trim();
    if (isProduction && (!dbUrl || !dbUrl.startsWith('postgres'))) {
      console.error(
        '❌ FATAL: Production strictly requires PostgreSQL DATABASE_URL. Local SQLite (finora.db) is deprecated.'
      );
      process.exit(1);
    } else if (dbUrl.startsWith('file:') || dbUrl.startsWith('sqlite:')) {
      console.warn(
        '⚠️  DEPRECATION NOTICE: Local SQLite (finora.db) is deprecated. Production environments strictly require PostgreSQL with TDE/LUKS volume encryption.'
      );
    }

    await initDatabasePragmas();
    // In production, do not auto-seed demo account unless explicitly requested via SEED_DEMO=true
    const shouldSeed = isProduction
      ? process.env.SEED_DEMO === 'true'
      : process.env.SEED_DEMO !== 'false';

    if (shouldSeed) {
      await seedDatabase();
    }
  } catch (seedErr: unknown) {
    const msg = seedErr instanceof Error ? seedErr.message : String(seedErr);
    console.warn('Database initialization/seed warning:', msg);
  }

  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `🚀 Faisaa Server (${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}) running at http://localhost:${PORT}`
    );
    startScheduler();
  });
}

async function gracefulShutdown(signal: string) {
  console.log(`\n🛑 Received ${signal}. Gracefully shutting down Faisaa server...`);
  try {
    stopScheduler();
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await prisma.$disconnect();
    console.log('✅ Database disconnected & HTTP server closed.');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();
