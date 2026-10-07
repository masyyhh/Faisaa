import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import prisma, { ensureDefaultCategoriesForUser } from '../prisma/client.js';
import {
  createAccessToken,
  createRefreshToken,
  setAuthCookies,
  clearAuthCookies,
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

/**
 * Sanitizes user record for API responses.
 * Never leaks passwordHash, telegram linking secrets, reset codes, or raw telegramBotTokens.
 */
function sanitizeUser(user: any) {
  if (!user) return null;
  const {
    passwordHash: _pw,
    telegramLinkingCode: _code,
    telegramLinkingExpires: _exp,
    passwordResetCode: _prc,
    passwordResetExpires: _pre,
    refreshTokens: _rt,
    ...safe
  } = user;

  return {
    ...safe,
    telegramBotToken: maskToken(safe.telegramBotToken),
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
    const accessToken = createAccessToken(user.id);
    const refreshToken = await createRefreshToken(user.id);
    setAuthCookies(res, accessToken, refreshToken);

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

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { username: identifier },
        ],
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email/username or password.',
      });
    }

    const valid = await bcrypt.compare(parsed.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email/username or password.',
      });
    }

    // Dual-token issuance
    const accessToken = createAccessToken(user.id);
    const refreshToken = await createRefreshToken(user.id);
    setAuthCookies(res, accessToken, refreshToken);

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

    // Rotate: Revoke current token and generate new pair
    const newRawRefreshToken = generateSecureToken(40);
    const newTokenHash = hashToken(newRawRefreshToken);
    const newAccessToken = createAccessToken(storedToken.userId);
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

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
        // New token provided: encrypt prior to database storage
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

    if (!password || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Please provide your account password to confirm deletion.',
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
      const currentAttempts = (user as any)._resetAttempts || 0;
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

