import type { Request, Response, NextFunction } from 'express';
import prisma from '../prisma/client.js';
import { accountSchema, transferSchema } from '../validators/schemas.js';
import { toMVR, toUSD } from '../utils/currency.js';

export async function getAccounts(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const rate = Number(req.user!.usdToMvrRate || 15.42);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const accounts = await prisma.account.findMany({
      where: { userId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
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

    const enriched = accounts.map((acc) => {
      const monthlyIncome = acc.transactions
        .filter((t) => t.type === 'INCOME')
        .reduce((sum, t) => sum + t.amount, 0);
      const monthlyExpenses = acc.transactions
        .filter((t) => t.type === 'EXPENSE')
        .reduce((sum, t) => sum + t.amount, 0);
      const { transactions, ...rest } = acc;

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
        netWorth: Number((totalAssetsMvr - totalLiabilitiesMvr).toFixed(2)),
        netWorthUsd: toUSD(totalAssetsMvr - totalLiabilitiesMvr, 'MVR', rate),
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

    const [account, allTxs] = await Promise.all([
      prisma.account.findFirst({
        where: { id, userId },
        include: {
          transactions: {
            orderBy: { date: 'desc' },
            take: 30,
            include: {
              category: true,
              transferToAccount: { select: { id: true, name: true, currency: true } },
              transactionTags: { include: { tag: true } },
            },
          },
        },
      }),
      prisma.transaction.findMany({
        where: { accountId: id, userId },
        orderBy: { date: 'asc' },
        select: { type: true, amount: true, currency: true, date: true },
      }),
    ]);

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found.',
      });
    }

    const totalIncome = allTxs
      .filter((t) => t.type === 'INCOME')
      .reduce((s, t) => s + t.amount, 0);
    const totalExpenses = allTxs
      .filter((t) => t.type === 'EXPENSE')
      .reduce((s, t) => s + t.amount, 0);

    const now = new Date();
    const balanceHistory: Array<{ month: string; balance: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const mDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const monthName = mDate.toLocaleString('en-US', { month: 'short' });

      const txsAfterPeriod = allTxs.filter((t) => new Date(t.date) >= nextMDate);
      let netAfter = 0;
      for (const tx of txsAfterPeriod) {
        if (tx.type === 'INCOME') netAfter += tx.amount;
        else if (tx.type === 'EXPENSE') netAfter -= tx.amount;
        else if (tx.type === 'TRANSFER') netAfter -= tx.amount;
      }

      balanceHistory.push({
        month: monthName,
        balance: Number((account.balance - netAfter).toFixed(2)),
      });
    }

    res.json({
      success: true,
      account: {
        ...account,
        balanceInMvr: toMVR(account.balance, account.currency, rate),
        balanceInUsd: toUSD(account.balance, account.currency, rate),
        totalIncome,
        totalExpenses,
        balanceHistory,
        transactions: (account.transactions || []).map((tx) => ({
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
    // PCI-DSS / Financial Data Protection: Strip any raw account number, retaining only sanitized lastFour
    const { accountNumber: _rawNum, ...accountData } = parsed;

    const account = await prisma.account.create({
      data: {
        ...accountData,
        currency: parsed.currency || 'MVR',
        initialBalance: parsed.balance,
        userId: req.user!.id,
      },
    });

    res.status(201).json({
      success: true,
      account,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const existing = await prisma.account.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Account not found.',
      });
    }

    const parsed = accountSchema.partial().parse(req.body);
    const { accountNumber: _rawNum, ...accountData } = parsed;

    const updated = await prisma.account.update({
      where: { id },
      data: accountData,
    });

    res.json({
      success: true,
      account: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const existing = await prisma.account.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Account not found.',
      });
    }

    await prisma.account.delete({ where: { id } });

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
