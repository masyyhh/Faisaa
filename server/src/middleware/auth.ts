import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../prisma/client.js';
import { generateSecureToken, hashToken } from '../utils/crypto.js';

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string | null;
  email: string;
  currency: string;
  secondaryCurrency: string;
  usdToMvrRate: number;
  dateFormat: string;
  theme: string;
  avatarUrl: string | null;
  notifyBudgetAlerts: boolean;
  notifyBillReminders: boolean;
  notifyGoalMilestones: boolean;
  telegramEnabled: boolean;
  telegramBotToken: string | null;
  telegramChatId: string | null;
  hideBalances: boolean;
  createdAt: Date;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      cookies?: Record<string, string>;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

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

export function createAccessToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: (process.env.ACCESS_TOKEN_EXPIRES_IN || '15m') as jwt.SignOptions['expiresIn'],
  });
}

// Backwards-compatible alias
export function signToken(userId: string): string {
  return createAccessToken(userId);
}

export async function createRefreshToken(userId: string): Promise<string> {
  const rawToken = generateSecureToken(40);
  const tokenHash = hashToken(rawToken);
  if (!tokenHash) throw new Error('Failed to generate refresh token hash');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
    },
  });

  return rawToken;
}

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string | null = null
): void {
  const isProd = process.env.NODE_ENV === 'production';
  const baseOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'strict' : 'lax') as 'strict' | 'lax',
    path: '/',
  };

  if (accessToken) {
    res.cookie('faisaa_access_token', accessToken, {
      ...baseOptions,
      maxAge: 15 * 60 * 1000, // 15 minutes
    });
  }

  if (refreshToken) {
    res.cookie('faisaa_refresh_token', refreshToken, {
      ...baseOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }
}

export function clearAuthCookies(res: Response): void {
  const isProd = process.env.NODE_ENV === 'production';
  const baseOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'strict' : 'lax') as 'strict' | 'lax',
    path: '/',
  };
  res.clearCookie('faisaa_access_token', baseOptions);
  res.clearCookie('faisaa_refresh_token', baseOptions);
}

export async function protect(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    let token: string | null = null;

    // 1. Prefer secure httpOnly cookie
    if (req.cookies?.faisaa_access_token) {
      token = req.cookies.faisaa_access_token;
    }

    // 2. Fallback to Authorization: Bearer header
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    let decoded: { userId: string };
    try {
      decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as { userId: string };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'Access token expired. Please refresh session.',
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token.',
      });
    }

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

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void | Response {
  if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Malformed JSON payload.',
    });
  }

  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: (err.errors || []).map((e: any) => ({
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
