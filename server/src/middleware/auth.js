import jwt from 'jsonwebtoken';
import prisma from '../prisma/client.js';

const INSECURE_PLACEHOLDERS = new Set([
  'your-secure-256-bit-jwt-secret',
  'replace-with-a-cryptographically-secure-256-bit-secret-key',
  'faisaa_production_jwt_secret_change_me_in_env_2026',
  'finora_super_secret_jwt_key_2026_production_ready',
  'secret',
  'changeme',
]);

if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.JWT_SECRET ||
    INSECURE_PLACEHOLDERS.has(process.env.JWT_SECRET) ||
    process.env.JWT_SECRET.length < 32)
) {
  console.error(
    '❌ FATAL: JWT_SECRET environment variable must be set to a cryptographically strong secret (minimum 32 characters) in production.'
  );
  process.exit(1);
}

const JWT_SECRET =
  process.env.JWT_SECRET || 'finora_super_secret_jwt_key_2026_production_ready';

export function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

export async function protect(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        email: true,
        currency: true,
        secondaryCurrency: true,
        usdToMvrRate: true,
        dateFormat: true,
        theme: true,
        avatarUrl: true,
        notifyBudgetAlerts: true,
        notifyBillReminders: true,
        notifyGoalMilestones: true,
        telegramEnabled: true,
        telegramBotToken: true,
        telegramChatId: true,
        hideBalances: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User associated with this token no longer exists.',
      });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication token.',
    });
  }
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Malformed JSON payload.',
    });
  }

  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  if (err.name?.startsWith('PrismaClient')) {
    return res.status(400).json({
      success: false,
      message: 'Database operation rejected due to invalid reference or constraint.',
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  if (statusCode >= 500) {
    console.error(
      `[${new Date().toISOString()}] ERROR ${req.method} ${req.originalUrl}:`,
      err.stack || err.message
    );
  }

  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? 'Internal server error' : err.message,
  });
}
