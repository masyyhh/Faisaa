import bcrypt from 'bcryptjs';
import prisma, { ensureDefaultCategoriesForUser } from '../prisma/client.js';
import { signToken } from '../middleware/auth.js';
import {
  registerSchema,
  loginSchema,
  profileUpdateSchema,
  passwordUpdateSchema,
} from '../validators/schemas.js';

export async function register(req, res, next) {
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

    const passwordHash = await bcrypt.hash(parsed.password, 10);

    const user = await prisma.user.create({
      data: {
        firstName: parsed.firstName.trim(),
        lastName: parsed.lastName.trim(),
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
        title: 'Welcome to Finora (MVR & USD Edition)!',
        message: 'MVR is set as your base currency and USD ($) as secondary. Update your USD→MVR exchange rate anytime.',
        type: 'SYSTEM',
        severity: 'SUCCESS',
        actionUrl: '/',
      },
    });

    const token = signToken(user.id);

    const { passwordHash: _, ...safeUser } = user;
    res.status(201).json({
      success: true,
      token,
      user: safeUser,
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const parsed = loginSchema.parse(req.body);
    const email = parsed.email.toLowerCase().trim();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const valid = await bcrypt.compare(parsed.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const token = signToken(user.id);
    const { passwordHash: _, ...safeUser } = user;

    res.json({
      success: true,
      token,
      user: safeUser,
    });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req, res, next) {
  try {
    res.json({
      success: true,
      user: req.user,
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res) {
  res.json({
    success: true,
    message: 'Logged out successfully.',
  });
}

export async function updateProfile(req, res, next) {
  try {
    const parsed = profileUpdateSchema.parse(req.body);

    if (parsed.email && parsed.email.toLowerCase() !== req.user.email) {
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

    if (parsed.usdToMvrRate && parsed.usdToMvrRate !== req.user.usdToMvrRate) {
      await prisma.exchangeRateHistory.create({
        data: {
          userId: req.user.id,
          rate: parsed.usdToMvrRate,
          note: 'Updated via Settings',
        },
      });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...parsed,
        ...(parsed.email ? { email: parsed.email.toLowerCase() } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
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
      user: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function updatePassword(req, res, next) {
  try {
    const parsed = passwordUpdateSchema.parse(req.body);

    const fullUser = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    const isMatch = await bcrypt.compare(parsed.currentPassword, fullUser.passwordHash);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect.',
      });
    }

    const passwordHash = await bcrypt.hash(parsed.newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash },
    });

    res.json({
      success: true,
      message: 'Password updated successfully.',
    });
  } catch (err) {
    next(err);
  }
}
