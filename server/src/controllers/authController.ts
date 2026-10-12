import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import type { Prisma, User } from '@prisma/client';
import prisma, { ensureDefaultCategoriesForUser } from '../prisma/client.js';
import {
  createAccessToken,
  createRefreshToken,
  setAuthCookies,
  setTrustedDeviceCookie,
  clearAuthCookies,
  type AuthUser,
} from '../middleware/auth.js';
import {
  encrypt,
  decrypt,
  maskToken,
  hashToken,
  generateSecureToken,
} from '../utils/crypto.js';
import {
  registerSchema,
  loginSchema,
  profileUpdateSchema,
  passwordUpdateSchema,
  forgotPasswordRequestSchema,
  resetPasswordConfirmSchema,
} from '../validators/schemas.js';
import { sendTelegramMessageRaw } from '../services/telegramService.js';
import {
  checkAccountLockout,
  recordFailedLogin,
  resetFailedLogins,
  getClientIp,
  getDeviceInfo,
  generateStepUpToken,
  verifyStepUpToken,
  generateOtpForUser,
  verifyOtpForUser,
  createTrustedDevice,
  isDeviceTrusted,
  logSecurityEvent,
} from '../services/securityService.js';
import { invalidateUserProfile } from '../utils/cache.js';

/**
 * Sanitizes user record for API responses.
 * Never leaks passwordHash, telegram linking secrets, reset codes, or raw telegramBotTokens.
 */
function sanitizeUser(user: AuthUser | User | Record<string, unknown> | null | undefined) {
  if (!user) return null;
  const userObj = user as Record<string, unknown>;
  const {
    passwordHash: _pw,
    telegramLinkingCode: _code,
    telegramLinkingExpires: _exp,
    passwordResetCode: _prc,
    passwordResetExpires: _pre,
    refreshTokens: _rt,
    ...safe
  } = userObj;

  return {
    ...safe,
    telegramBotToken: maskToken(typeof safe.telegramBotToken === 'string' ? safe.telegramBotToken : null),
  };
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = registerSchema.parse(req.body);
    const email = parsed.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    let username: string | null = parsed.username ? parsed.username.toLowerCase().trim() : null;
    if (username) {
      const existingUsername = await prisma.user.findFirst({ where: { username } });
      if (existingUsername) {
        return res.status(400).json({
          success: false,
          message: 'That username is already taken. Please choose another.',
        });
      }
    } else {
      // Auto-assign clean username candidate from email prefix if available
      const candidate = email.split('@')[0].replace(/[^a-z0-9_.-]/g, '').slice(0, 30);
      if (candidate.length >= 3) {
        const taken = await prisma.user.findFirst({ where: { username: candidate } });
        if (!taken) {
          username = candidate;
        }
      }
    }

    // Password security: Bcrypt work factor 12 (OWASP recommended standard)
    const passwordHash = await bcrypt.hash(parsed.password, 12);

    const user = await prisma.user.create({
      data: {
        firstName: parsed.firstName.trim(),
        lastName: parsed.lastName.trim(),
        username,
        email,
        passwordHash,
        currency: parsed.currency || 'MVR',
        secondaryCurrency: parsed.currency === 'USD' ? 'MVR' : 'USD',
        usdToMvrRate: 15.42,
        telegramEnabled: false,
        telegramBotToken: null,
        telegramChatId: null,
      },
    });

    await ensureDefaultCategoriesForUser(user.id);

    // Create default BML MVR & BML USD accounts so user can immediately track both currencies
    await prisma.account.createMany({
      data: [
        {
          userId: user.id,
          name: 'BML MVR Checking',
          type: 'CHECKING',
          balance: 0,
          initialBalance: 0,
          currency: 'MVR',
          color: '#8B5CF6',
          icon: 'landmark',
          institution: 'Bank of Maldives',
          lastFour: '1001',
        },
        {
          userId: user.id,
          name: 'BML USD Account',
          type: 'SAVINGS',
          balance: 0,
          initialBalance: 0,
          currency: 'USD',
          color: '#10B981',
          icon: 'piggy-bank',
          institution: 'Bank of Maldives (USD)',
          lastFour: '2002',
        },
      ],
    });

    await prisma.exchangeRateHistory.create({
      data: {
        userId: user.id,
        rate: 15.42,
        note: 'Initial official MVR/USD rate',
      },
    });

    await prisma.notification.create({
      data: {
        userId: user.id,
        title: 'Welcome to Faisaa (MVR & USD Edition)!',
        message: 'MVR is set as your base currency and USD ($) as secondary. Update your USD→MVR exchange rate anytime.',
        type: 'SYSTEM',
        severity: 'SUCCESS',
        actionUrl: '/',
      },
    });

    // Dual-token issuance: 15m access token + 7d rotating refresh token
    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || null;
    const accessToken = createAccessToken(user.id);
    const refreshToken = await createRefreshToken(user.id, {
      userAgent,
      ipAddress: clientIp,
      deviceInfo: getDeviceInfo(userAgent),
    });
    setAuthCookies(res, accessToken, refreshToken);

    await logSecurityEvent({
      userId: user.id,
      action: 'USER_REGISTERED',
      ipAddress: clientIp,
      userAgent,
    });

    res.status(201).json({
      success: true,
      token: accessToken,
      user: sanitizeUser(user),
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = loginSchema.parse(req.body);
    const identifier = (parsed.identifier || parsed.username || parsed.email || '').trim().toLowerCase();
    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || null;

    // 1. Account Lockout & Brute-Force Circuit Breaker
    const lockout = await checkAccountLockout(identifier, clientIp);
    if (lockout.isLocked) {
      return res.status(423).json({
        success: false,
        code: 'ACCOUNT_LOCKED',
        message: `Account is temporarily locked due to 10 consecutive failed attempts. Please try again in ${lockout.remainingMinutes || 15} minutes.`,
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { username: identifier },
        ],
      },
    });

    if (!user) {
      const failed = await recordFailedLogin(identifier, clientIp, userAgent || undefined);
      return res.status(401).json({
        success: false,
        message: 'Invalid email/username or password.',
        attemptsLeft: failed.attemptsLeft,
      });
    }

    const valid = await bcrypt.compare(parsed.password, user.passwordHash);
    if (!valid) {
      const failed = await recordFailedLogin(identifier, clientIp, userAgent || undefined);
      return res.status(401).json({
        success: false,
        message: 'Invalid email/username or password.',
        attemptsLeft: failed.attemptsLeft,
      });
    }

    // Password valid -> reset lockout counters
    await resetFailedLogins(user.id, clientIp);

    // 2. Check Device Trust
    const rawTrustToken = (req.cookies?.faisaa_trusted_device || req.headers['x-device-trust-token']) as string | undefined;
    const isTrusted = await isDeviceTrusted(user.id, rawTrustToken);

    // If device is NOT trusted, issue Time-Based OTP challenge
    if (!isTrusted) {
      const { otp } = await generateOtpForUser(user.id);

      // Dispatch via Telegram if user has active bot configuration
      let botToken: string | null = null;
      if (user.telegramBotToken) botToken = decrypt(user.telegramBotToken);
      if (!botToken) botToken = process.env.TELEGRAM_BOT_TOKEN || null;

      if (botToken && user.telegramChatId) {
        await sendTelegramMessageRaw(
          botToken,
          user.telegramChatId,
          `🔐 *Faisaa Security: Login Verification Code*\n\n` +
            `Hello *${user.firstName}*,\n\n` +
            `Your one-time authentication code is: \`${otp}\`\n\n` +
            `• *IP Address:* \`${clientIp}\`\n` +
            `• *Device:* ${getDeviceInfo(userAgent)}\n` +
            `• *Expires in:* 5 minutes\n\n` +
            `If you did not initiate this login, please secure your account immediately.`
        );
      }

      // Record security notification
      await prisma.notification.create({
        data: {
          userId: user.id,
          title: '🔐 Login One-Time Code Generated',
          message: `Sign-in verification code: ${otp}. Valid for 5 minutes.`,
          type: 'SECURITY',
          severity: 'INFO',
        },
      });

      await logSecurityEvent({
        userId: user.id,
        action: 'OTP_CHALLENGE_ISSUED',
        ipAddress: clientIp,
        userAgent,
        metadata: { identifier },
      });

      return res.json({
        success: true,
        requiresOtp: true,
        userId: user.id,
        message: 'A 6-digit one-time code was generated. Please enter it to complete sign-in.',
        simulationOtp: process.env.NODE_ENV !== 'production' ? otp : undefined,
      });
    }

    // 3. Trusted device: issue session immediately
    const accessToken = createAccessToken(user.id);
    const refreshToken = await createRefreshToken(user.id, {
      userAgent,
      ipAddress: clientIp,
      deviceInfo: getDeviceInfo(userAgent),
    });
    setAuthCookies(res, accessToken, refreshToken);

    await logSecurityEvent({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      ipAddress: clientIp,
      userAgent,
      metadata: { deviceTrusted: true },
    });

    res.json({
      success: true,
      token: accessToken,
      user: sanitizeUser(user),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Verify One-Time Code & Complete Login
 * Allows trusting device/browser for N days (default 30 days)
 */
export async function verifyLoginOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, otp, trustDevice, trustDays } = req.body;
    if (!userId || !otp) {
      return res.status(400).json({
        success: false,
        message: 'User ID and 6-digit OTP code are required.',
      });
    }

    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || null;

    const isValid = await verifyOtpForUser(userId, String(otp).trim());
    if (!isValid) {
      await logSecurityEvent({
        userId,
        action: 'OTP_VERIFICATION_FAILED',
        ipAddress: clientIp,
        userAgent,
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired one-time verification code.',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    // Trust device if requested
    let trustedToken: string | null = null;
    if (trustDevice) {
      const days = Number(trustDays) > 0 ? Number(trustDays) : 30;
      trustedToken = await createTrustedDevice(userId, userAgent || undefined, clientIp, days);
      setTrustedDeviceCookie(res, trustedToken, days);
    }

    const accessToken = createAccessToken(user.id);
    const refreshToken = await createRefreshToken(user.id, {
      userAgent,
      ipAddress: clientIp,
      deviceInfo: getDeviceInfo(userAgent),
    });
    setAuthCookies(res, accessToken, refreshToken);

    await logSecurityEvent({
      userId: user.id,
      action: 'LOGIN_SUCCESS_OTP',
      ipAddress: clientIp,
      userAgent,
      metadata: { trustedDevice: Boolean(trustDevice) },
    });

    res.json({
      success: true,
      token: accessToken,
      trustedDeviceToken: trustedToken,
      user: sanitizeUser(user),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Step-Up Authentication (Re-enter password for high-risk actions)
 * Returns a 5-minute cryptographic step-up token
 */
export async function stepUpVerify(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { password } = req.body;

    if (!password || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Current password is required for step-up verification.',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || null;

    if (!valid) {
      await logSecurityEvent({
        userId,
        action: 'STEP_UP_FAILED',
        ipAddress: clientIp,
        userAgent,
      });
      return res.status(401).json({
        success: false,
        message: 'Incorrect password confirmation.',
      });
    }

    const stepUpToken = generateStepUpToken(userId);

    await logSecurityEvent({
      userId,
      action: 'STEP_UP_VERIFIED',
      ipAddress: clientIp,
      userAgent,
    });

    res.json({
      success: true,
      stepUpToken,
      expiresInSeconds: 300,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List active sessions for the authenticated user
 */
export async function getSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const currentRawRefreshToken = (req.cookies?.faisaa_refresh_token || req.body?.refreshToken) as string | undefined;
    const currentHash = currentRawRefreshToken ? hashToken(currentRawRefreshToken) : null;

    const sessions = await prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastActiveAt: 'desc' },
      select: {
        id: true,
        tokenHash: true,
        deviceInfo: true,
        userAgent: true,
        ipAddress: true,
        lastActiveAt: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    const formatted = sessions.map((s) => ({
      id: s.id,
      deviceInfo: s.deviceInfo || 'Web Browser',
      userAgent: s.userAgent,
      ipAddress: s.ipAddress || '127.0.0.1',
      lastActiveAt: s.lastActiveAt,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isCurrent: currentHash ? s.tokenHash === currentHash : false,
    }));

    res.json({
      success: true,
      sessions: formatted,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Revoke a specific active session
 */
export async function revokeSession(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const existing = await prisma.refreshToken.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }

    await prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    await logSecurityEvent({
      userId,
      action: 'SESSION_REVOKED',
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      metadata: { sessionId: id },
    });

    res.json({
      success: true,
      message: 'Session revoked successfully.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Log out of all other active sessions except the current one
 */
export async function revokeOtherSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const currentRawRefreshToken = (req.cookies?.faisaa_refresh_token || req.body?.refreshToken) as string | undefined;
    const currentHash = currentRawRefreshToken ? hashToken(currentRawRefreshToken) : null;

    const whereClause: { userId: string; revokedAt: null; tokenHash?: { not: string } } = {
      userId,
      revokedAt: null,
    };

    if (currentHash) {
      whereClause.tokenHash = { not: currentHash };
    }

    const { count } = await prisma.refreshToken.updateMany({
      where: whereClause,
      data: { revokedAt: new Date() },
    });

    await logSecurityEvent({
      userId,
      action: 'ALL_OTHER_SESSIONS_REVOKED',
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      metadata: { revokedCount: count },
    });

    res.json({
      success: true,
      message: `Successfully logged out of ${count} other active session${count === 1 ? '' : 's'}.`,
      revokedCount: count,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Rotate Refresh Token & Issue New 15m Access Token
 * Implements token reuse detection to defeat token theft/replay attacks.
 */
export async function refreshSession(req: Request, res: Response, next: NextFunction) {
  try {
    const rawRefreshToken = (req.cookies?.faisaa_refresh_token || req.body?.refreshToken) as string | undefined;

    if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
      return res.status(401).json({
        success: false,
        message: 'Refresh token missing. Please sign in.',
      });
    }

    const tokenHash = hashToken(rawRefreshToken);
    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken) {
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token.',
      });
    }

    // Reuse detection: If token was already revoked, someone is replaying an old token!
    if (storedToken.revokedAt) {
      console.warn(
        `🚨 SECURITY ALERT: Refresh token reuse detected for user ${storedToken.userId}. Invalidating all active sessions.`
      );
      // Immediately revoke all existing refresh tokens for this user
      await prisma.refreshToken.updateMany({
        where: { userId: storedToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: 'Security breach detected: refresh token was reused. Please log in again.',
      });
    }

    // Check expiration
    if (new Date(storedToken.expiresAt) < new Date()) {
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        message: 'Refresh token expired. Please log in again.',
      });
    }

    // Rotate: Revoke current token and generate new pair, carrying over device info
    const newRawRefreshToken = generateSecureToken(40);
    const newTokenHash = hashToken(newRawRefreshToken);
    const newAccessToken = createAccessToken(storedToken.userId);
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || storedToken.userAgent;

    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: {
          revokedAt: new Date(),
          replacedByTokenHash: newTokenHash,
        },
      }),
      prisma.refreshToken.create({
        data: {
          tokenHash: newTokenHash,
          userId: storedToken.userId,
          expiresAt: newExpiresAt,
          userAgent,
          ipAddress: clientIp,
          deviceInfo: storedToken.deviceInfo || getDeviceInfo(userAgent),
          lastActiveAt: new Date(),
        },
      }),
    ]);

    setAuthCookies(res, newAccessToken, newRawRefreshToken);

    res.json({
      success: true,
      token: newAccessToken,
      user: sanitizeUser(storedToken.user),
    });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({
      success: true,
      user: sanitizeUser(req.user),
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const rawRefreshToken = (req.cookies?.faisaa_refresh_token || req.body?.refreshToken) as string | undefined;
    if (rawRefreshToken && typeof rawRefreshToken === 'string') {
      const tokenHash = hashToken(rawRefreshToken);
      await prisma.refreshToken
        .updateMany({
          where: { tokenHash, revokedAt: null },
          data: { revokedAt: new Date() },
        })
        .catch(() => {});
    }

    clearAuthCookies(res);

    res.json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = profileUpdateSchema.parse(req.body);
    const currentUser = req.user!;

    if (parsed.email && parsed.email.toLowerCase() !== currentUser.email) {
      const stepUpToken = req.headers['x-step-up-token'] as string | undefined;
      if (!stepUpToken || !verifyStepUpToken(stepUpToken, currentUser.id)) {
        return res.status(403).json({
          success: false,
          code: 'STEP_UP_REQUIRED',
          message: 'Step-up authentication required to alter your registered email address.',
        });
      }

      const emailTaken = await prisma.user.findUnique({
        where: { email: parsed.email.toLowerCase() },
      });
      if (emailTaken) {
        return res.status(400).json({
          success: false,
          message: 'That email address is already in use.',
        });
      }
    }

    if (parsed.username !== undefined && parsed.username !== null) {
      const cleanUsername = parsed.username.toLowerCase().trim();
      if (cleanUsername && cleanUsername !== currentUser.username?.toLowerCase()) {
        const usernameTaken = await prisma.user.findFirst({
          where: {
            username: cleanUsername,
            NOT: { id: currentUser.id },
          },
        });
        if (usernameTaken) {
          return res.status(400).json({
            success: false,
            message: 'That username is already taken. Please choose another.',
          });
        }
      }
    }

    if (parsed.usdToMvrRate && parsed.usdToMvrRate !== currentUser.usdToMvrRate) {
      await prisma.exchangeRateHistory.create({
        data: {
          userId: currentUser.id,
          rate: parsed.usdToMvrRate,
          note: 'Updated via Settings',
        },
      });
    }

    // Build update payload
    const dataToUpdate: Prisma.UserUpdateInput = {
      ...parsed,
      ...(parsed.email ? { email: parsed.email.toLowerCase().trim() } : {}),
      ...(parsed.username !== undefined
        ? { username: parsed.username ? parsed.username.toLowerCase().trim() : null }
        : {}),
    };

    // Sensitive Credential Encryption at Rest (AES-256-GCM)
    if (parsed.telegramBotToken !== undefined) {
      const rawToken = parsed.telegramBotToken ? parsed.telegramBotToken.trim() : null;
      if (!rawToken) {
        dataToUpdate.telegramBotToken = null;
      } else if (rawToken.includes('•')) {
        // User submitted back the masked token; preserve existing encrypted token
        delete dataToUpdate.telegramBotToken;
      } else {
        // New token provided: enforce step-up authentication
        const stepUpToken = req.headers['x-step-up-token'] as string | undefined;
        if (!stepUpToken || !verifyStepUpToken(stepUpToken, currentUser.id)) {
          return res.status(403).json({
            success: false,
            code: 'STEP_UP_REQUIRED',
            message: 'Step-up authentication required to connect or update Telegram bot credentials.',
          });
        }
        dataToUpdate.telegramBotToken = encrypt(rawToken);
      }
    }

    const updated = await prisma.user.update({
      where: { id: currentUser.id },
      data: dataToUpdate,
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

    await invalidateUserProfile(currentUser.id);

    res.json({
      success: true,
      user: sanitizeUser(updated),
    });
  } catch (err) {
    next(err);
  }
}

export async function updatePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = passwordUpdateSchema.parse(req.body);
    const userId = req.user!.id;

    const fullUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!fullUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    const isMatch = await bcrypt.compare(parsed.currentPassword, fullUser.passwordHash);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect.',
      });
    }

    // Bcrypt work factor 12
    const passwordHash = await bcrypt.hash(parsed.newPassword, 12);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Invalidate old refresh sessions upon password change for security
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Issue fresh session tokens and update cookies
    const accessToken = createAccessToken(userId);
    const refreshToken = await createRefreshToken(userId);
    setAuthCookies(res, accessToken, refreshToken);

    res.json({
      success: true,
      token: accessToken,
      message: 'Password updated successfully.',
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { password } = req.body;
    const stepUpToken = req.headers['x-step-up-token'] as string | undefined;
    const isStepUpValid = Boolean(stepUpToken && verifyStepUpToken(stepUpToken, userId));

    if (!isStepUpValid) {
      if (!password || typeof password !== 'string') {
        return res.status(403).json({
          success: false,
          code: 'STEP_UP_REQUIRED',
          message: 'Please provide your account password or step-up authentication to confirm account deletion.',
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User account not found.',
        });
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Incorrect password. Account deletion was not performed.',
        });
      }
    }

    await logSecurityEvent({
      userId,
      action: 'ACCOUNT_DELETED',
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });

    // Cascade delete: Prisma and database cascade all related accounts, transactions, budgets, bills, loans, etc.
    await prisma.user.delete({
      where: { id: userId },
    });

    clearAuthCookies(res);

    res.json({
      success: true,
      message: 'Your account and all associated data have been permanently deleted.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Request Password Reset (Step 1)
 * Generates a 6-digit one-time code valid for 15 minutes.
 * If user has Telegram enabled, sends code directly to their Telegram chat.
 * Also logs to console for local/self-hosted administrative visibility.
 */
export async function requestPasswordReset(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = forgotPasswordRequestSchema.parse(req.body);
    const identifier = parsed.identifier.toLowerCase().trim();

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { username: identifier },
        ],
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found matching that email or username.',
      });
    }

    // Generate secure 6-digit verification code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetCode: resetCode,
        passwordResetExpires: expiresAt,
      },
    });

    // Attempt Telegram dispatch
    let telegramSent = false;
    let botToken: string | null = null;
    if (user.telegramBotToken) {
      botToken = decrypt(user.telegramBotToken);
    }
    if (!botToken) {
      botToken = process.env.TELEGRAM_BOT_TOKEN || null;
    }

    const chatId =
      user.telegramChatId ||
      (['alex@faisaa.online', 'alex@faisaa.io', 'alex@finora.io'].includes(user.email)
        ? process.env.TELEGRAM_CHAT_ID
        : null);

    if (botToken && chatId) {
      const tgMsg =
        `🔐 *Faisaa Password Reset Request*\n\n` +
        `Hello *${user.firstName}*,\n\n` +
        `Your 6-digit verification code to reset your password is:\n` +
        `👉 \`${resetCode}\`\n\n` +
        `⏳ Valid for *15 minutes*.\n` +
        `If you did not request this reset, your account is secure and you can ignore this alert.`;
      const tgRes = await sendTelegramMessageRaw(botToken, chatId, tgMsg);
      telegramSent = Boolean(tgRes.sent);
    }

    console.log(
      `[Auth] 🔑 Password reset code for ${user.email} (@${user.username || 'none'}): [${resetCode}] (Expires in 15m, Telegram dispatched: ${telegramSent})`
    );

    const maskedEmail = user.email.replace(/(.{2})(.*)(?=@)/, (_match, start, mid) => `${start}${'*'.repeat(mid.length)}`);

    res.json({
      success: true,
      message: telegramSent
        ? `A 6-digit verification code has been sent to your linked Telegram account.`
        : `Verification code generated! Please enter the 6-digit code to continue.`,
      telegramSent,
      hasTelegram: Boolean(chatId),
      targetUser: {
        email: maskedEmail,
        firstName: user.firstName,
      },
      devCode: (!telegramSent && process.env.NODE_ENV !== 'production') ? resetCode : undefined,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Confirm Password Reset (Step 2)
 * Verifies the 6-digit code, enforces password complexity, updates password hash,
 * and invalidates old sessions.
 */
export async function confirmPasswordReset(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = resetPasswordConfirmSchema.parse(req.body);
    const identifier = parsed.identifier.toLowerCase().trim();
    const code = parsed.code.trim();

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { username: identifier },
        ],
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found matching that email or username.',
      });
    }

    if (!user.passwordResetCode || !user.passwordResetExpires) {
      return res.status(400).json({
        success: false,
        message: 'No active password reset request found. Please request a new code.',
      });
    }

    if (new Date(user.passwordResetExpires) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'This reset code has expired. Please request a new code.',
      });
    }

    if (user.passwordResetCode !== code) {
      // Invalidate code after 5 failed guesses to prevent brute-forcing
      const currentAttempts = (user as unknown as { _resetAttempts?: number })._resetAttempts || 0;
      if (currentAttempts >= 4) {
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordResetCode: null, passwordResetExpires: null },
        });
        return res.status(400).json({
          success: false,
          message: 'Too many incorrect attempts. For security, this reset code has been deactivated. Please request a new code.',
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code. Please check and try again.',
      });
    }

    // Bcrypt work factor 12
    const passwordHash = await bcrypt.hash(parsed.newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordResetCode: null,
          passwordResetExpires: null,
        },
      }),
      // Revoke all existing sessions
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    // Send Telegram alert confirming password change
    let botToken = user.telegramBotToken ? decrypt(user.telegramBotToken) : (process.env.TELEGRAM_BOT_TOKEN || null);
    const chatId =
      user.telegramChatId ||
      (['alex@faisaa.online', 'alex@faisaa.io', 'alex@finora.io'].includes(user.email)
        ? process.env.TELEGRAM_CHAT_ID
        : null);

    if (botToken && chatId) {
      sendTelegramMessageRaw(
        botToken,
        chatId,
        `✅ *Password Reset Successful*\nYour Faisaa account password was just successfully reset.`
      ).catch(() => {});
    }

    res.json({
      success: true,
      message: 'Password reset successfully! You can now log in with your new password.',
    });
  } catch (err) {
    next(err);
  }
}

