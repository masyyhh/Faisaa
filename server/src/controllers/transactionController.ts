import type { Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../prisma/client.js';
import { transactionSchema } from '../validators/schemas.js';
import { sendTelegramNotification } from '../services/telegramService.js';

export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';

function getTransferConvertedAmount(
  sourceCurrency: string | null | undefined,
  targetCurrency: string | null | undefined,
  amount: number,
  rate = 15.42
): number {
  if (!sourceCurrency || !targetCurrency || sourceCurrency === targetCurrency) {
    return amount;
  }
  const r = Number(rate || 15.42);
  if (sourceCurrency === 'USD' && targetCurrency === 'MVR') {
    return Number((amount * r).toFixed(2));
  }
  if (sourceCurrency === 'MVR' && targetCurrency === 'USD') {
    return Number((amount / r).toFixed(2));
  }
  return amount;
}

async function checkBudgetThresholdAndNotify(
  userId: string,
  categoryId: string | null | undefined,
  txDate: string | Date,
  rate = 15.42
): Promise<void> {
  if (!categoryId) return;
  const dateObj = new Date(txDate);
  const month = dateObj.getMonth() + 1;
  const year = dateObj.getFullYear();

  const budget = await prisma.budget.findFirst({
    where: { userId, categoryId, month, year },
    include: { category: true },
  });
  if (!budget) return;

  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  const monthExpenses = await prisma.transaction.findMany({
    where: {
      userId,
      categoryId,
      type: 'EXPENSE',
      date: { gte: startOfMonth, lte: endOfMonth },
    },
    include: { account: { select: { currency: true } } },
  });

  const spent = monthExpenses.reduce((sum, t) => {
    const c = t.currency || t.account?.currency || 'MVR';
    return sum + (c === 'USD' ? t.amount * rate : t.amount);
  }, 0);
  const pct = Math.round((spent / budget.amount) * 100);

  if (pct >= 100) {
    const title = `Over Budget: ${budget.category.name}`;
    const msg = `You are over your ${budget.category.name} budget (MVR ${budget.amount.toLocaleString()}) with MVR ${spent.toLocaleString()} spent (${pct}%).`;
    await prisma.notification.create({
      data: {
        userId,
        title,
        message: msg,
        type: 'BUDGET_OVER',
        severity: 'DANGER',
        actionUrl: '/budgets',
      },
    });
    await sendTelegramNotification(userId, title, msg);
  } else if (pct >= budget.alertThreshold) {
    const title = `Budget Alert: ${budget.category.name}`;
    const msg = `Your ${budget.category.name} budget is ${pct}% used (MVR ${spent.toLocaleString()} of MVR ${budget.amount.toLocaleString()}).`;
    await prisma.notification.create({
      data: {
        userId,
        title,
        message: msg,
        type: 'BUDGET_WARNING',
        severity: 'WARNING',
        actionUrl: '/budgets',
      },
    });
    await sendTelegramNotification(userId, title, msg);
  }
}

export async function getTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const {
      search,
      type,
      accountId,
      categoryId,
      tag,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      payee,
      isRecurring,
      sortBy = 'date',
      sortOrder = 'desc',
      page = 1,
      limit = 25,
    } = req.query as Record<string, string | undefined>;

    const where: Prisma.TransactionWhereInput = { userId };

    if (type && type !== 'ALL') {
      where.type = type as TransactionType;
    }
    if (accountId && accountId !== 'ALL') {
      where.OR = [{ accountId }, { transferToAccountId: accountId }];
    }
    if (categoryId && categoryId !== 'ALL') {
      where.categoryId = categoryId;
    }
    if (isRecurring !== undefined && isRecurring !== '') {
      where.isRecurring = isRecurring === 'true';
    }
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.date.lte = end;
      }
    }
    if (minAmount || maxAmount) {
      where.amount = {};
      if (minAmount) where.amount.gte = Number(minAmount);
      if (maxAmount) where.amount.lte = Number(maxAmount);
    }
    if (payee) {
      where.payee = { contains: payee };
    }
    if (tag && tag !== 'ALL') {
      where.transactionTags = {
        some: {
          tag: { name: tag },
        },
      };
    }
    if (search && search.trim()) {
      const q = search.trim();
      const searchCond: Prisma.TransactionWhereInput[] = [
        { payee: { contains: q } },
        { description: { contains: q } },
        { notes: { contains: q } },
        { category: { name: { contains: q } } },
        { transactionTags: { some: { tag: { name: { contains: q } } } } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchCond }];
        delete where.OR;
      } else {
        where.OR = searchCond;
      }
    }

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(String(limit), 10) || 25));
    const skip = (pageNum - 1) * pageSize;

    const validSortFields = ['date', 'amount', 'payee', 'createdAt'];
    const orderField = validSortFields.includes(String(sortBy)) ? String(sortBy) : 'date';
    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

    const rate = Number(req.user!.usdToMvrRate || 15.42);

    const [totalCount, transactions, allMatching] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        orderBy: { [orderField]: orderDir },
        skip,
        take: pageSize,
        include: {
          account: {
            select: { id: true, name: true, type: true, color: true, icon: true, currency: true },
          },
          transferToAccount: {
            select: { id: true, name: true, type: true, color: true, currency: true },
          },
          category: { select: { id: true, name: true, type: true, icon: true, color: true } },
          transactionTags: {
            include: { tag: true },
          },
        },
      }),
      prisma.transaction.findMany({
        where,
        select: {
          type: true,
          amount: true,
          currency: true,
          account: { select: { currency: true } },
        },
      }),
    ]);

    const toMvrVal = (t: { amount: number; currency?: string | null; account?: { currency: string } | null }) => {
      const c = t.currency || t.account?.currency || 'MVR';
      return c === 'USD' ? t.amount * rate : t.amount;
    };

    const totalIncome = Number(
      allMatching
        .filter((t) => t.type === 'INCOME')
        .reduce((s, t) => s + toMvrVal(t), 0)
        .toFixed(2)
    );
    const totalExpenses = Number(
      allMatching
        .filter((t) => t.type === 'EXPENSE')
        .reduce((s, t) => s + toMvrVal(t), 0)
        .toFixed(2)
    );

    const formatted = transactions.map((t) => ({
      ...t,
      tags: (t.transactionTags || []).map((tt) => tt?.tag?.name).filter(Boolean),
      tagObjects: (t.transactionTags || []).map((tt) => tt?.tag).filter(Boolean),
    }));

    res.json({
      success: true,
      transactions: formatted,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: pageSize,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
      },
      summary: {
        totalIncome,
        totalExpenses,
        netFlow: Number((totalIncome - totalExpenses).toFixed(2)),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getTransactionById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const tx = await prisma.transaction.findFirst({
      where: { id, userId: req.user!.id },
      include: {
        account: true,
        transferToAccount: true,
        category: true,
        transactionTags: { include: { tag: true } },
      },
    });

    if (!tx) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found.',
      });
    }

    res.json({
      success: true,
      transaction: {
        ...tx,
        tags: (tx.transactionTags || []).map((tt) => tt?.tag?.name).filter(Boolean),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = transactionSchema.parse(req.body);
    const userId = req.user!.id;

    const account = await prisma.account.findFirst({
      where: { id: parsed.accountId, userId },
    });
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Selected account not found.',
      });
    }

    let destAcc: { currency: string; id: string } | null = null;
    if (parsed.transferToAccountId) {
      destAcc = await prisma.account.findFirst({
        where: { id: parsed.transferToAccountId, userId },
        select: { id: true, currency: true },
      });
      if (!destAcc) {
        return res.status(403).json({
          success: false,
          message: 'Destination transfer account not found or unauthorized.',
        });
      }
    }

    if (parsed.categoryId) {
      const cat = await prisma.category.findFirst({
        where: { id: parsed.categoryId, userId },
      });
      if (!cat) {
        return res.status(403).json({
          success: false,
          message: 'Selected category not found or unauthorized.',
        });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      // 1. Update account balance(s)
      if (parsed.type === 'INCOME') {
        await tx.account.update({
          where: { id: account.id },
          data: { balance: { increment: parsed.amount } },
        });
      } else if (parsed.type === 'EXPENSE') {
        await tx.account.update({
          where: { id: account.id },
          data: { balance: { decrement: parsed.amount } },
        });
      } else if (parsed.type === 'TRANSFER') {
        const rate = Number(req.user!.usdToMvrRate || 15.42);
        const creditAmount = destAcc
          ? getTransferConvertedAmount(account.currency, destAcc.currency, parsed.amount, rate)
          : parsed.amount;

        await tx.account.update({
          where: { id: account.id },
          data: { balance: { decrement: parsed.amount } },
        });
        if (parsed.transferToAccountId) {
          await tx.account.update({
            where: { id: parsed.transferToAccountId },
            data: { balance: { increment: creditAmount } },
          });
        }
      }

      // 2. Create transaction record
      const newTx = await tx.transaction.create({
        data: {
          userId,
          accountId: parsed.accountId,
          transferToAccountId: parsed.transferToAccountId || null,
          categoryId: parsed.categoryId || null,
          type: parsed.type,
          amount: parsed.amount,
          currency: account.currency || 'MVR',
          exchangeRateUsed: Number(req.user!.usdToMvrRate || 15.42),
          payee: parsed.payee,
          description: parsed.description || null,
          notes: parsed.notes || null,
          date: new Date(parsed.date),
          isRecurring: Boolean(parsed.isRecurring),
        },
      });

      // 3. Attach tags
      if (parsed.tags && parsed.tags.length > 0) {
        for (const rawTag of parsed.tags) {
          const tagName = rawTag.trim();
          if (!tagName) continue;
          const tagRecord = await tx.tag.upsert({
            where: { userId_name: { userId, name: tagName } },
            update: {},
            create: { userId, name: tagName, color: '#8B5CF6' },
          });
          await tx.transactionTag.create({
            data: {
              transactionId: newTx.id,
              tagId: tagRecord.id,
            },
          });
        }
      }

      return tx.transaction.findUnique({
        where: { id: newTx.id },
        include: {
          account: true,
          transferToAccount: true,
          category: true,
          transactionTags: { include: { tag: true } },
        },
      });
    });

    const rate = Number(req.user!.usdToMvrRate || 15.42);
    if (parsed.type === 'EXPENSE' && parsed.categoryId) {
      await checkBudgetThresholdAndNotify(userId, parsed.categoryId, parsed.date, rate);
    }

    // Send non-blocking Telegram notification for new transaction
    const sym = account.currency === 'USD' ? '$' : 'MVR ';
    sendTelegramNotification(
      req.user!,
      `New ${parsed.type}: ${parsed.payee}`,
      `Amount: ${sym}${parsed.amount.toLocaleString()} (${account.name})`
    ).catch(() => {});

    res.status(201).json({
      success: true,
      transaction: created
        ? {
            ...created,
            tags: (created.transactionTags || []).map((tt) => tt?.tag?.name).filter(Boolean),
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const existing = await prisma.transaction.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found.',
      });
    }

    const parsed = transactionSchema.partial().parse(req.body);

    if (parsed.accountId && parsed.accountId !== existing.accountId) {
      const checkAcc = await prisma.account.findFirst({
        where: { id: parsed.accountId, userId },
      });
      if (!checkAcc) {
        return res.status(403).json({
          success: false,
          message: 'Target account not found or unauthorized.',
        });
      }
    }

    if (parsed.transferToAccountId) {
      const checkDest = await prisma.account.findFirst({
        where: { id: parsed.transferToAccountId, userId },
      });
      if (!checkDest) {
        return res.status(403).json({
          success: false,
          message: 'Destination transfer account not found or unauthorized.',
        });
      }
    }

    if (parsed.categoryId) {
      const checkCat = await prisma.category.findFirst({
        where: { id: parsed.categoryId, userId },
      });
      if (!checkCat) {
        return res.status(403).json({
          success: false,
          message: 'Selected category not found or unauthorized.',
        });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Reverse old balance effect
      if (existing.type === 'INCOME') {
        await tx.account.update({
          where: { id: existing.accountId },
          data: { balance: { decrement: existing.amount } },
        });
      } else if (existing.type === 'EXPENSE') {
        await tx.account.update({
          where: { id: existing.accountId },
          data: { balance: { increment: existing.amount } },
        });
      } else if (existing.type === 'TRANSFER') {
        const rate = existing.exchangeRateUsed || Number(req.user!.usdToMvrRate || 15.42);
        const oldFromAcc = await tx.account.findUnique({ where: { id: existing.accountId } });
        const oldToAcc = existing.transferToAccountId
          ? await tx.account.findUnique({ where: { id: existing.transferToAccountId } })
          : null;
        const oldCredit = oldFromAcc && oldToAcc
          ? getTransferConvertedAmount(oldFromAcc.currency, oldToAcc.currency, existing.amount, rate)
          : existing.amount;

        await tx.account.update({
          where: { id: existing.accountId },
          data: { balance: { increment: existing.amount } },
        });
        if (existing.transferToAccountId) {
          await tx.account.update({
            where: { id: existing.transferToAccountId },
            data: { balance: { decrement: oldCredit } },
          });
        }
      }

      const newType = parsed.type || existing.type;
      const newAmount = parsed.amount !== undefined ? parsed.amount : existing.amount;
      const newAccountId = parsed.accountId || existing.accountId;
      const newTransferToId =
        parsed.transferToAccountId !== undefined
          ? parsed.transferToAccountId
          : existing.transferToAccountId;

      // 2. Apply new balance effect
      if (newType === 'INCOME') {
        await tx.account.update({
          where: { id: newAccountId },
          data: { balance: { increment: newAmount } },
        });
      } else if (newType === 'EXPENSE') {
        await tx.account.update({
          where: { id: newAccountId },
          data: { balance: { decrement: newAmount } },
        });
      } else if (newType === 'TRANSFER') {
        const rate = Number(req.user!.usdToMvrRate || 15.42);
        const newFromAcc = await tx.account.findUnique({ where: { id: newAccountId } });
        const newToAcc = newTransferToId
          ? await tx.account.findUnique({ where: { id: newTransferToId } })
          : null;
        const newCredit = newFromAcc && newToAcc
          ? getTransferConvertedAmount(newFromAcc.currency, newToAcc.currency, newAmount, rate)
          : newAmount;

        await tx.account.update({
          where: { id: newAccountId },
          data: { balance: { decrement: newAmount } },
        });
        if (newTransferToId) {
          await tx.account.update({
            where: { id: newTransferToId },
            data: { balance: { increment: newCredit } },
          });
        }
      }

      // 3. Update tags if provided
      if (parsed.tags !== undefined) {
        await tx.transactionTag.deleteMany({ where: { transactionId: id } });
        for (const rawTag of parsed.tags) {
          const tagName = rawTag.trim();
          if (!tagName) continue;
          const tagRecord = await tx.tag.upsert({
            where: { userId_name: { userId, name: tagName } },
            update: {},
            create: { userId, name: tagName, color: '#8B5CF6' },
          });
          await tx.transactionTag.create({
            data: { transactionId: id, tagId: tagRecord.id },
          });
        }
      }

      // 4. Update transaction row
      return tx.transaction.update({
        where: { id },
        data: {
          accountId: newAccountId,
          transferToAccountId: newTransferToId,
          categoryId: parsed.categoryId !== undefined ? parsed.categoryId : existing.categoryId,
          type: newType,
          amount: newAmount,
          payee: parsed.payee !== undefined ? parsed.payee : existing.payee,
          description: parsed.description !== undefined ? parsed.description : existing.description,
          notes: parsed.notes !== undefined ? parsed.notes : existing.notes,
          date: parsed.date ? new Date(parsed.date) : existing.date,
          isRecurring: parsed.isRecurring !== undefined ? parsed.isRecurring : existing.isRecurring,
        },
        include: {
          account: true,
          transferToAccount: true,
          category: true,
          transactionTags: { include: { tag: true } },
        },
      });
    });

    res.json({
      success: true,
      transaction: {
        ...updated,
        tags: (updated.transactionTags || []).map((tt) => tt?.tag?.name).filter(Boolean),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const existing = await prisma.transaction.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found.',
      });
    }

    await prisma.$transaction(async (tx) => {
      if (existing.type === 'INCOME') {
        await tx.account.update({
          where: { id: existing.accountId },
          data: { balance: { decrement: existing.amount } },
        });
      } else if (existing.type === 'EXPENSE') {
        await tx.account.update({
          where: { id: existing.accountId },
          data: { balance: { increment: existing.amount } },
        });
      } else if (existing.type === 'TRANSFER') {
        const rate = existing.exchangeRateUsed || Number(req.user!.usdToMvrRate || 15.42);
        const oldFromAcc = await tx.account.findUnique({ where: { id: existing.accountId } });
        const oldToAcc = existing.transferToAccountId
          ? await tx.account.findUnique({ where: { id: existing.transferToAccountId } })
          : null;
        const oldCredit = oldFromAcc && oldToAcc
          ? getTransferConvertedAmount(oldFromAcc.currency, oldToAcc.currency, existing.amount, rate)
          : existing.amount;

        await tx.account.update({
          where: { id: existing.accountId },
          data: { balance: { increment: existing.amount } },
        });
        if (existing.transferToAccountId) {
          await tx.account.update({
            where: { id: existing.transferToAccountId },
            data: { balance: { decrement: oldCredit } },
          });
        }
      }

      await tx.transaction.delete({ where: { id } });
    });

    res.json({
      success: true,
      message: 'Transaction deleted and account balance updated.',
    });
  } catch (err) {
    next(err);
  }
}

export async function duplicateTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const existing = await prisma.transaction.findFirst({
      where: { id, userId },
      include: { transactionTags: true },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found.',
      });
    }

    const duplicated = await prisma.$transaction(async (tx) => {
      if (existing.type === 'INCOME') {
        await tx.account.update({
          where: { id: existing.accountId },
          data: { balance: { increment: existing.amount } },
        });
      } else if (existing.type === 'EXPENSE') {
        await tx.account.update({
          where: { id: existing.accountId },
          data: { balance: { decrement: existing.amount } },
        });
      }

      const copy = await tx.transaction.create({
        data: {
          userId,
          accountId: existing.accountId,
          transferToAccountId: existing.transferToAccountId,
          categoryId: existing.categoryId,
          type: existing.type,
          amount: existing.amount,
          payee: `${existing.payee}`,
          description: existing.description,
          notes: existing.notes,
          date: new Date(),
          isRecurring: existing.isRecurring,
        },
      });

      for (const tt of existing.transactionTags) {
        await tx.transactionTag.create({
          data: { transactionId: copy.id, tagId: tt.tagId },
        });
      }

      return tx.transaction.findUnique({
        where: { id: copy.id },
        include: {
          account: true,
          transferToAccount: true,
          category: true,
          transactionTags: { include: { tag: true } },
        },
      });
    });

    res.status(201).json({
      success: true,
      transaction: duplicated
        ? {
            ...duplicated,
            tags: (duplicated.transactionTags || []).map((tt) => tt?.tag?.name).filter(Boolean),
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
}

export async function getPayeeHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const recent = await prisma.transaction.findMany({
      where: {
        userId,
        payee: { not: '' },
        categoryId: { not: null },
      },
      orderBy: { date: 'desc' },
      take: 250,
      select: {
        payee: true,
        categoryId: true,
        category: {
          select: { id: true, name: true },
        },
      },
    });

    const payeeMap: Record<string, { categoryId: string; categoryName: string }> = {};
    for (const tx of recent) {
      if (!tx.payee || !tx.categoryId || !tx.category) continue;
      const key = tx.payee.trim().toLowerCase();
      if (!payeeMap[key]) {
        payeeMap[key] = {
          categoryId: tx.categoryId,
          categoryName: tx.category.name,
        };
      }
    }

    res.json({
      success: true,
      payeeMap,
    });
  } catch (err) {
    next(err);
  }
}
