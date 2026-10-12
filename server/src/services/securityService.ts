import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { generateSecret, generateSync, verifySync } from 'otplib';
import prisma from '../prisma/client.js';
import { encrypt, decrypt, generateSecureToken, hashToken } from '../utils/crypto.js';
import { cacheGet, cacheSet, cacheDel } from '../utils/cache.js';
import { sendTelegramMessageRaw } from './telegramService.js';

const STEP_UP_JWT_SECRET =
  (process.env.JWT_SECRET || 'finora_super_secret_jwt_key_2026_production_ready') + '_step_up_subsecret';

export interface SecurityEventParams {
  userId?: string | null;
  action: string;
  ipAddress: string;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Record an immutable security audit event in the database
 */
export async function logSecurityEvent(params: SecurityEventParams): Promise<void> {
  try {
    await prisma.securityAuditLog.create({
      data: {
        userId: params.userId || null,
        action: params.action,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent || null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  } catch (err) {
    console.warn('[SecurityService] Failed to write security audit log:', err);
  }
}

/**
 * Parse client IP address accurately through reverse proxies (Cloudflare, Fly, AWS)
 */
export function getClientIp(req: Request): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string') return cfIp.trim();

  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }

  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

/**
 * Format human-readable device name from User-Agent string
 */
export function getDeviceInfo(userAgent?: string | null): string {
  if (!userAgent) return 'Unknown Device';
  const ua = userAgent.toLowerCase();

  let os = 'Unknown OS';
  if (ua.includes('macintosh') || ua.includes('mac os')) os = 'macOS';
  else if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
  else if (ua.includes('linux')) os = 'Linux';

  let browser = 'Browser';
  if (ua.includes('edg/')) browser = 'Edge';
  else if (ua.includes('chrome/') && !ua.includes('edg/')) browser = 'Chrome';
  else if (ua.includes('safari/') && !ua.includes('chrome/')) browser = 'Safari';
  else if (ua.includes('firefox/')) browser = 'Firefox';

  return `${browser} on ${os}`;
}

// -------------------------------------------------------------
// ACCOUNT LOCKOUT & BRUTE-FORCE CIRCUIT BREAKER
// -------------------------------------------------------------
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function checkAccountLockout(
  identifier: string,
  ip: string
): Promise<{ isLocked: boolean; remainingMinutes?: number }> {
  const normId = identifier.toLowerCase().trim();

  // 1. Check IP-level lockout
  const ipLockKey = `lockout:ip:${ip}`;
  const ipLockedUntil = await cacheGet<number>(ipLockKey);
  if (ipLockedUntil && Date.now() < ipLockedUntil) {
    const remainingMinutes = Math.ceil((ipLockedUntil - Date.now()) / 60000);
    return { isLocked: true, remainingMinutes };
  }

  // 2. Check User-level lockout in DB
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: normId }, { username: normId }],
    },
    select: { id: true, lockoutUntil: true },
  });

  if (user?.lockoutUntil && user.lockoutUntil.getTime() > Date.now()) {
    const remainingMinutes = Math.ceil((user.lockoutUntil.getTime() - Date.now()) / 60000);
    return { isLocked: true, remainingMinutes };
  }

  return { isLocked: false };
}

export async function recordFailedLogin(
  identifier: string,
  ip: string,
  userAgent?: string
): Promise<{ locked: boolean; attemptsLeft: number }> {
  const normId = identifier.toLowerCase().trim();

  // Find user if exists
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: normId }, { username: normId }],
    },
  });

  const ipAttemptKey = `attempts:ip:${ip}`;
  const currentIpAttempts = ((await cacheGet<number>(ipAttemptKey)) || 0) + 1;
  await cacheSet(ipAttemptKey, currentIpAttempts, 15 * 60);

  let newAttempts = 1;
  if (user) {
    newAttempts = user.failedLoginAttempts + 1;
  }

  const isTriggered = newAttempts >= MAX_FAILED_ATTEMPTS || currentIpAttempts >= MAX_FAILED_ATTEMPTS;

  if (isTriggered) {
    const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);

    // Lock IP
    await cacheSet(`lockout:ip:${ip}`, lockUntil.getTime(), 15 * 60);

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newAttempts,
          lockoutUntil: lockUntil,
        },
      });

      // Dispatch security alert in-app
      await prisma.notification.create({
        data: {
          userId: user.id,
          title: '🚨 Security Alert: Account Temporarily Locked',
          message: `Your account was temporarily locked for 15 minutes after 10 consecutive failed login attempts from IP: ${ip}. If this was not you, please secure your account immediately.`,
          type: 'SECURITY',
          severity: 'ALERT',
        },
      });

      // Dispatch Telegram alert if user has bot token connected
      let botToken: string | null = null;
      if (user.telegramBotToken) botToken = decrypt(user.telegramBotToken);
      if (!botToken) botToken = process.env.TELEGRAM_BOT_TOKEN || null;

      if (botToken && user.telegramChatId) {
        await sendTelegramMessageRaw(
          botToken,
          user.telegramChatId,
          `🚨 *SECURITY ALERT: Account Locked*\n\n` +
            `Hello *${user.firstName}*,\n\n` +
            `Your Faisaa account has been *temporarily locked for 15 minutes* due to 10 consecutive failed login attempts.\n\n` +
            `• *IP Address:* \`${ip}\`\n` +
            `• *Time:* ${new Date().toISOString()}\n\n` +
            `If you did not initiate this, consider updating your credentials once the lockout period ends.`
        );
      }
    }

    await logSecurityEvent({
      userId: user?.id,
      action: 'ACCOUNT_LOCKED',
      ipAddress: ip,
      userAgent,
      metadata: { identifier: normId, attempts: newAttempts, ipAttempts: currentIpAttempts },
    });

    return { locked: true, attemptsLeft: 0 };
  }

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: newAttempts },
    });
  }

  await logSecurityEvent({
    userId: user?.id,
    action: 'LOGIN_FAILED',
    ipAddress: ip,
    userAgent,
    metadata: { identifier: normId, attempts: newAttempts },
  });

  return {
    locked: false,
    attemptsLeft: Math.max(0, MAX_FAILED_ATTEMPTS - Math.max(newAttempts, currentIpAttempts)),
  };
}

export async function resetFailedLogins(userId: string, ip: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: 0,
      lockoutUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: ip,
    },
  });

  await cacheDel(`attempts:ip:${ip}`);
  await cacheDel(`lockout:ip:${ip}`);
}

// -------------------------------------------------------------
// STEP-UP AUTHENTICATION (High-Risk Actions)
// -------------------------------------------------------------
export function generateStepUpToken(userId: string, actionScope: string = 'high-risk'): string {
  return jwt.sign({ userId, scope: actionScope }, STEP_UP_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m', // Step-up tokens expire strictly after 5 minutes
  });
}

export function verifyStepUpToken(token: string, userId: string): boolean {
  try {
    const payload = jwt.verify(token, STEP_UP_JWT_SECRET, { algorithms: ['HS256'] }) as {
      userId: string;
      scope: string;
    };
    return payload.userId === userId;
  } catch {
    return false;
  }
}

/**
 * Express middleware to enforce Step-Up authentication for high-risk actions.
 * Looks for 'x-step-up-token' header.
 */
export function requireStepUpAuth(req: Request, res: Response, next: NextFunction): void | Response {
  const user = req.user;
  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    });
  }

  const stepUpHeader = req.headers['x-step-up-token'];
  const token = typeof stepUpHeader === 'string' ? stepUpHeader.trim() : null;

  if (!token || !verifyStepUpToken(token, user.id)) {
    return res.status(403).json({
      success: false,
      code: 'STEP_UP_REQUIRED',
      message: 'Step-up authentication required. Please re-enter your password to perform this sensitive action.',
    });
  }

  next();
}

// -------------------------------------------------------------
// TOTP & OTP DEVICE TRUST
// -------------------------------------------------------------
export async function generateOtpForUser(userId: string): Promise<{ otp: string; expiresAt: Date }> {
  // Generate RFC 6238 TOTP using otplib
  const secretKey = `otp:secret:${userId}`;
  let secret = await cacheGet<string>(secretKey);
  if (!secret) {
    secret = generateSecret();
    await cacheSet(secretKey, secret, 10 * 60); // 10 minutes
  }

  const otp = generateSync({ secret });
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Cache pending OTP
  const otpKey = `otp:user:${userId}`;
  await cacheSet(otpKey, { otp, secret, expiresAt: expiresAt.getTime() }, 5 * 60);

  return { otp, expiresAt };
}

export async function verifyOtpForUser(userId: string, enteredCode: string): Promise<boolean> {
  const otpKey = `otp:user:${userId}`;
  const data = await cacheGet<{ otp: string; secret: string; expiresAt: number }>(otpKey);

  if (!data) return false;
  if (Date.now() > data.expiresAt) {
    await cacheDel(otpKey);
    return false;
  }

  const clean = enteredCode.trim();
  if (data.otp === clean) {
    await cacheDel(otpKey);
    return true;
  }

  if (data.secret) {
    const res = verifySync({ secret: data.secret, token: clean });
    if (res.valid) {
      await cacheDel(otpKey);
      return true;
    }
  }

  return false;
}

export async function createTrustedDevice(
  userId: string,
  userAgent?: string,
  ip?: string,
  days: number = 30
): Promise<string> {
  const rawToken = generateSecureToken(32);
  const deviceHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  await prisma.trustedDevice.create({
    data: {
      userId,
      deviceHash,
      deviceName: getDeviceInfo(userAgent),
      userAgent: userAgent || null,
      ipAddress: ip || null,
      expiresAt,
    },
  });

  return rawToken;
}

export async function isDeviceTrusted(userId: string, rawDeviceToken?: string | null): Promise<boolean> {
  if (!rawDeviceToken) return false;

  const deviceHash = hashToken(rawDeviceToken);
  const trusted = await prisma.trustedDevice.findUnique({
    where: { deviceHash },
  });

  if (!trusted || trusted.userId !== userId) return false;

  if (trusted.expiresAt.getTime() < Date.now()) {
    // Expired trust
    await prisma.trustedDevice.delete({ where: { id: trusted.id } });
    return false;
  }

  return true;
}

// -------------------------------------------------------------
// CONCURRENT SESSIONS TRACKING
// -------------------------------------------------------------
export async function recordSession(params: {
  userId: string;
  tokenHash: string;
  userAgent?: string;
  ipAddress?: string;
}): Promise<void> {
  try {
    await prisma.refreshToken.update({
      where: { tokenHash: params.tokenHash },
      data: {
        userAgent: params.userAgent || null,
        ipAddress: params.ipAddress || null,
        deviceInfo: getDeviceInfo(params.userAgent),
        lastActiveAt: new Date(),
      },
    });
  } catch {
    // Non-fatal
  }
}

export async function updateSessionActivity(tokenHash: string): Promise<void> {
  try {
    await prisma.refreshToken.update({
      where: { tokenHash },
      data: { lastActiveAt: new Date() },
    });
  } catch {
    // Non-fatal
  }
}
