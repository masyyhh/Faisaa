import type { Request, Response, NextFunction } from 'express';
import prisma from '../prisma/client.js';
import { accountSchema, transferSchema } from '../validators/schemas.js';
import { toMVR, toUSD } from '../utils/currency.js';
import { encrypt, decrypt } from '../utils/crypto.js';

function sanitizeAccount<T extends Record<string, unknown>>(account: T): Omit<T, 'encryptedAccountNumber'> {
  const { encryptedAccountNumber: _enc, ...safe } = account;
  return safe;
}

export async function getAccounts(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const rate = Number(req.user!.usdToMvrRate || 15.42);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const accounts = await prisma.account.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { isActive: 'desc' }, { createdAt: 'asc' }],
      include: {
        transactions: {
          where: { date: { gte: startOfMonth } },
          select: { type: true, amount: true, currency: true },
        },
        _count: {
          select: { transactions: true },
        },
      },
    });

    // Auto-heal: If user has accounts but none is marked as default, designate the first active account as default
    if (accounts.length > 0 && !accounts.some((a) => a.isDefault)) {
      const defaultCandidate = accounts.find((a) => a.isActive) || accounts[0];
      await prisma.account.update({
        where: { id: defaultCandidate.id },
        data: { isDefault: true },
      });
      defaultCandidate.isDefault = true;
    }

    const enriched = accounts.map((acc) => {
      const monthlyIncome = acc.transactions
        .filter((t) => t.type === 'INCOME')
        .reduce((sum, t) => sum + t.amount, 0);
      const monthlyExpenses = acc.transactions
        .filter((t) => t.type === 'EXPENSE')
        .reduce((sum, t) => sum + t.amount, 0);
      const { transactions, encryptedAccountNumber: _enc, ...rest } = acc;

      const balanceInMvr = toMVR(acc.balance, acc.currency, rate);
      const balanceInUsd = toUSD(acc.balance, acc.currency, rate);

      return {
        ...rest,
        balanceInMvr,
        balanceInUsd,
        monthlyIncome,
        monthlyExpenses,
        transactionCount: acc._count.transactions,
      };
    });

    const totalAssetsMvr = enriched
      .filter((a) => a.isActive && !['CREDIT_CARD', 'LOAN'].includes(a.type) && a.balance >= 0)
      .reduce((s, a) => s + a.balanceInMvr, 0);

    const totalLiabilitiesMvr = enriched
      .filter((a) => a.isActive && (['CREDIT_CARD', 'LOAN'].includes(a.type) || a.balance < 0))
      .reduce((s, a) => s + Math.abs(a.balanceInMvr), 0);

    const totalBalanceMvr = enriched
      .filter((a) => a.isActive)
      .reduce((s, a) => s + a.balanceInMvr, 0);

    res.json({
      success: true,
      usdToMvrRate: rate,
      accounts: enriched,
      summary: {
        totalBalance: Number(totalBalanceMvr.toFixed(2)),
        totalBalanceUsd: toUSD(totalBalanceMvr, 'MVR', rate),
        totalAssets: Number(totalAssetsMvr.toFixed(2)),
        totalAssetsUsd: toUSD(totalAssetsMvr, 'MVR', rate),
        totalLiabilities: Number(totalLiabilitiesMvr.toFixed(2)),
        totalLiabilitiesUsd: toUSD(totalLiabilitiesMvr, 'MVR', rate),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getAccountById(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const rate = Number(req.user!.usdToMvrRate || 15.42);
    const id = req.params.id as string;

    const [account, allTxs, recentTxs] = await Promise.all([
      prisma.account.findFirst({
        where: { id, userId },
      }),
      prisma.transaction.findMany({
        where: { OR: [{ accountId: id }, { transferToAccountId: id }], userId },
        orderBy: { date: 'asc' },
        select: {
          id: true,
          type: true,
          amount: true,
          currency: true,
          exchangeRateUsed: true,
          date: true,
          accountId: true,
          transferToAccountId: true,
        },
      }),
      prisma.transaction.findMany({
        where: { OR: [{ accountId: id }, { transferToAccountId: id }], userId },
        orderBy: { date: 'desc' },
        take: 30,
        include: {
          category: true,
          account: { select: { id: true, name: true, currency: true } },
          transferToAccount: { select: { id: true, name: true, currency: true } },
          transactionTags: { include: { tag: true } },
        },
      }),
    ]);

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found.',
      });
    }

    const getIncomingCredit = (tx: { amount: number; currency: string; exchangeRateUsed: number }) => {
      if (tx.currency === account.currency) return tx.amount;
      const r = tx.exchangeRateUsed || rate;
      if (tx.currency === 'USD' && account.currency === 'MVR') return Number((tx.amount * r).toFixed(2));
      if (tx.currency === 'MVR' && account.currency === 'USD') return Number((tx.amount / r).toFixed(2));
      return tx.amount;
    };

    let totalIncome = 0;
    let totalExpenses = 0;

    for (const tx of allTxs) {
      if (tx.accountId === id) {
        if (tx.type === 'INCOME') totalIncome += tx.amount;
        else if (tx.type === 'EXPENSE') totalExpenses += tx.amount;
      } else if (tx.transferToAccountId === id && tx.type === 'TRANSFER') {
        totalIncome += getIncomingCredit(tx);
      }
    }

    const now = new Date();
    const balanceHistory: Array<{ month: string; balance: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const mDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const monthName = mDate.toLocaleString('en-US', { month: 'short' });

      const txsAfterPeriod = allTxs.filter((t) => new Date(t.date) >= nextMDate);
      let netAfter = 0;
      for (const tx of txsAfterPeriod) {
        if (tx.accountId === id) {
          if (tx.type === 'INCOME') netAfter += tx.amount;
          else if (tx.type === 'EXPENSE') netAfter -= tx.amount;
          else if (tx.type === 'TRANSFER') netAfter -= tx.amount;
        } else if (tx.transferToAccountId === id && tx.type === 'TRANSFER') {
          netAfter += getIncomingCredit(tx);
        }
      }

      balanceHistory.push({
        month: monthName,
        balance: Number((account.balance - netAfter).toFixed(2)),
      });
    }

    const { encryptedAccountNumber: _enc, ...safeAccount } = account;

    res.json({
      success: true,
      account: {
        ...safeAccount,
        balanceInMvr: toMVR(account.balance, account.currency, rate),
        balanceInUsd: toUSD(account.balance, account.currency, rate),
        totalIncome: Number(totalIncome.toFixed(2)),
        totalExpenses: Number(totalExpenses.toFixed(2)),
        balanceHistory,
        transactions: recentTxs.map((tx) => ({
          ...tx,
          tags: (tx.transactionTags || []).map((tt) => tt?.tag?.name).filter(Boolean),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = accountSchema.parse(req.body);
    const userId = req.user!.id;
    const { accountNumber: rawNum, ...accountData } = parsed;

    let lastFour: string | null = accountData.lastFour || null;
    let encryptedAccountNumber: string | null = null;
    if (rawNum && typeof rawNum === 'string') {
      const cleanNum = rawNum.trim();
      if (cleanNum.length >= 4) {
        lastFour = cleanNum.slice(-4);
      }
      encryptedAccountNumber = encrypt(cleanNum);
    }

    const existingCount = await prisma.account.count({ where: { userId } });
    const shouldBeDefault = parsed.isDefault || existingCount === 0;

    const account = await prisma.$transaction(async (tx) => {
      if (shouldBeDefault) {
        await tx.account.updateMany({
          where: { userId },
          data: { isDefault: false },
        });
      }

      return tx.account.create({
        data: {
          ...accountData,
          lastFour,
          encryptedAccountNumber,
          isDefault: shouldBeDefault,
          currency: parsed.currency || 'MVR',
          initialBalance: parsed.balance,
          userId,
        },
      });
    });

    res.status(201).json({
      success: true,
      account: sanitizeAccount(account),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const userId = req.user!.id;
    const existing = await prisma.account.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Account not found.',
      });
    }

    const parsed = accountSchema.partial().parse(req.body);
    const { accountNumber: rawNum, ...accountData } = parsed;

    let lastFour = accountData.lastFour;
    let encryptedAccountNumber: string | undefined = undefined;
    if (rawNum && typeof rawNum === 'string') {
      const cleanNum = rawNum.trim();
      if (cleanNum.length >= 4) {
        lastFour = cleanNum.slice(-4);
      }
      encryptedAccountNumber = encrypt(cleanNum) || undefined;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (accountData.isDefault) {
        await tx.account.updateMany({
          where: { userId },
          data: { isDefault: false },
        });
      }

      return tx.account.update({
        where: { id },
        data: {
          ...accountData,
          ...(lastFour !== undefined && { lastFour }),
          ...(encryptedAccountNumber !== undefined && { encryptedAccountNumber }),
        },
      });
    });

    res.json({
      success: true,
      account: sanitizeAccount(updated),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Decrypt and reveal the full account number on-demand.
 * Enforced with Step-Up re-authentication.
 */
export async function revealAccountNumber(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const userId = req.user!.id;
    const account = await prisma.account.findFirst({
      where: { id, userId },
      select: { id: true, name: true, lastFour: true, encryptedAccountNumber: true },
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found.',
      });
    }

    const decrypted = account.encryptedAccountNumber ? decrypt(account.encryptedAccountNumber) : null;
    res.json({
      success: true,
      lastFour: account.lastFour,
      accountNumber: decrypted || (account.lastFour ? `•••• •••• •••• ${account.lastFour}` : null),
    });
  } catch (err) {
    next(err);
  }
}

export async function setDefaultAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const existing = await prisma.account.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Account not found.',
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.account.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
      return tx.account.update({
        where: { id },
        data: { isDefault: true, isActive: true },
      });
    });

    res.json({
      success: true,
      account: updated,
      message: `${updated.name} set as default account.`,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const userId = req.user!.id;
    const existing = await prisma.account.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Account not found.',
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.account.delete({ where: { id } });
      if (existing.isDefault) {
        const nextDefault = await tx.account.findFirst({
          where: { userId },
          orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
        });
        if (nextDefault) {
          await tx.account.update({
            where: { id: nextDefault.id },
            data: { isDefault: true },
          });
        }
      }
    });

    res.json({
      success: true,
      message: 'Account deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}

export async function transferBetweenAccounts(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = transferSchema.parse(req.body);
    const userId = req.user!.id;
    const rate = Number(req.user!.usdToMvrRate || 15.42);

    if (parsed.fromAccountId === parsed.toAccountId) {
      return res.status(400).json({
        success: false,
        message: 'Source and destination accounts must be different.',
      });
    }

    const [fromAcc, toAcc] = await Promise.all([
      prisma.account.findFirst({ where: { id: parsed.fromAccountId, userId } }),
      prisma.account.findFirst({ where: { id: parsed.toAccountId, userId } }),
    ]);

    if (!fromAcc || !toAcc) {
      return res.status(404).json({
        success: false,
        message: 'One or both accounts could not be found.',
      });
    }

    // If transferring between USD and MVR accounts, automatically apply exchange rate conversion!
    let creditAmount = parsed.amount;
    if (fromAcc.currency === 'USD' && toAcc.currency === 'MVR') {
      creditAmount = Number((parsed.amount * rate).toFixed(2));
    } else if (fromAcc.currency === 'MVR' && toAcc.currency === 'USD') {
      creditAmount = Number((parsed.amount / rate).toFixed(2));
    }

    const transferDate = parsed.date ? new Date(parsed.date) : new Date();

    const result = await prisma.$transaction(async (tx) => {
      const updatedFrom = await tx.account.update({
        where: { id: fromAcc.id },
        data: { balance: { decrement: parsed.amount } },
      });

      const updatedTo = await tx.account.update({
        where: { id: toAcc.id },
        data: { balance: { increment: creditAmount } },
      });

      const transferTx = await tx.transaction.create({
        data: {
          userId,
          accountId: fromAcc.id,
          transferToAccountId: toAcc.id,
          type: 'TRANSFER',
          amount: parsed.amount,
          currency: fromAcc.currency,
          exchangeRateUsed: rate,
          payee: `Transfer: ${fromAcc.name} (${fromAcc.currency}) → ${toAcc.name} (${toAcc.currency})`,
          description:
            fromAcc.currency !== toAcc.currency
              ? `Cross-currency transfer at 1 USD = MVR ${rate}`
              : parsed.description || `Internal transfer to ${toAcc.name}`,
          notes: parsed.notes || null,
          date: transferDate,
        },
        include: {
          account: true,
          transferToAccount: true,
        },
      });

      return { updatedFrom, updatedTo, transferTx };
    });

    res.status(201).json({
      success: true,
      message: 'Transfer completed successfully.',
      transaction: result.transferTx,
      fromAccount: result.updatedFrom,
      toAccount: result.updatedTo,
    });
  } catch (err) {
    next(err);
  }
}
