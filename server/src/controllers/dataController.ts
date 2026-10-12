import type { Request, Response, NextFunction } from 'express';
import prisma from '../prisma/client.js';

export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
export type BillStatus = 'UPCOMING' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export async function exportCSV(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      select: {
        date: true,
        type: true,
        payee: true,
        amount: true,
        currency: true,
        description: true,
        notes: true,
        isRecurring: true,
        account: { select: { name: true, currency: true } },
        category: { select: { name: true } },
        transactionTags: { select: { tag: { select: { name: true } } } },
      },
    });

    const headers = [
      'Date',
      'Type',
      'Payee',
      'Amount',
      'Currency',
      'Account',
      'Category',
      'Description',
      'Notes',
      'Tags',
      'Recurring',
    ];

    const escapeCSV = (val: unknown, isNumeric = false) => {
      if (val === null || val === undefined) return '';
      let str = String(val).replace(/"/g, '""');
      if (!isNumeric && /^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
    };

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="faisaa-transactions.csv"');

    res.write(headers.join(',') + '\n');
    for (const t of transactions) {
      const row = [
        new Date(t.date).toISOString().split('T')[0],
        t.type,
        t.payee,
        t.amount.toFixed(2),
        t.currency || t.account?.currency || 'MVR',
        t.account?.name || '',
        t.category?.name || '',
        t.description || '',
        t.notes || '',
        (t.transactionTags || []).map((tt) => tt?.tag?.name).filter(Boolean).join(';'),
        t.isRecurring ? 'Yes' : 'No',
      ];
      res.write(row.map((c) => escapeCSV(c)).join(',') + '\n');
    }
    res.end();
  } catch (err) {
    next(err);
  }
}

export async function exportJSONBackup(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;

    const [accounts, categories, transactions, budgets, goals, bills, recurring, tags] =
      await Promise.all([
        prisma.account.findMany({ where: { userId } }),
        prisma.category.findMany({ where: { userId } }),
        prisma.transaction.findMany({
          where: { userId },
          include: { transactionTags: { include: { tag: true } } },
        }),
        prisma.budget.findMany({ where: { userId } }),
        prisma.savingsGoal.findMany({ where: { userId } }),
        prisma.bill.findMany({ where: { userId } }),
        prisma.recurringTransaction.findMany({ where: { userId } }),
        prisma.tag.findMany({ where: { userId } }),
      ]);

    const payload = {
      app: 'Faisaa Personal Finance Tracker',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      user: {
        firstName: req.user!.firstName,
        lastName: req.user!.lastName,
        email: req.user!.email,
        currency: req.user!.currency,
      },
      data: {
        accounts,
        categories,
        transactions,
        budgets,
        goals,
        bills,
        recurring,
        tags,
      },
    };

    res.json({
      success: true,
      backup: payload,
    });
  } catch (err) {
    next(err);
  }
}

export async function importCSVTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { rows, defaultAccountId } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid rows provided for import.',
      });
    }

    if (rows.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'CSV import is limited to 500 rows per batch for security.',
      });
    }

    const [accounts, categories] = await Promise.all([
      prisma.account.findMany({ where: { userId } }),
      prisma.category.findMany({ where: { userId } }),
    ]);

    const fallbackAccount =
      accounts.find((a) => a.id === defaultAccountId) ||
      accounts.find((a) => a.isDefault && a.isActive) ||
      accounts.find((a) => a.isDefault) ||
      accounts.find((a) => a.isActive) ||
      accounts[0];

    if (!fallbackAccount) {
      return res.status(400).json({
        success: false,
        message: 'Please create at least one account before importing transactions.',
      });
    }

    const txRecordsToCreate: Array<{
      userId: string;
      accountId: string;
      categoryId: string | null;
      type: TransactionType;
      amount: number;
      currency: string;
      exchangeRateUsed: number;
      payee: string;
      description: string;
      notes: string | null;
      date: Date;
      isRecurring: boolean;
    }> = [];
    const accountBalanceDeltas: Record<string, number> = {};

    for (const row of rows) {
      const amount = Math.abs(parseFloat(row.amount || row.Amount || 0));
      if (!amount || isNaN(amount)) continue;

      const rawType = String(row.type || row.Type || 'EXPENSE').toUpperCase();
      const type: TransactionType = ['INCOME', 'EXPENSE', 'TRANSFER'].includes(rawType)
        ? (rawType as TransactionType)
        : 'EXPENSE';
      const payee = String(row.payee || row.Payee || row.Merchant || 'Imported Transaction').trim();
      const rawDate = row.date || row.Date || new Date().toISOString();
      const parsedDate = isNaN(Date.parse(rawDate)) ? new Date() : new Date(rawDate);

      const matchedAccount =
        accounts.find(
          (a) =>
            a.id === (row.accountId || defaultAccountId) ||
            a.name.toLowerCase() === String(row.account || row.Account || '').toLowerCase()
        ) || fallbackAccount;

      const matchedCategory = categories.find(
        (c) =>
          c.id === row.categoryId ||
          c.name.toLowerCase() === String(row.category || row.Category || '').toLowerCase()
      );

      const currency = row.currency || matchedAccount.currency || 'MVR';

      if (type === 'INCOME') {
        accountBalanceDeltas[matchedAccount.id] = (accountBalanceDeltas[matchedAccount.id] || 0) + amount;
      } else if (type === 'EXPENSE') {
        accountBalanceDeltas[matchedAccount.id] = (accountBalanceDeltas[matchedAccount.id] || 0) - amount;
      }

      txRecordsToCreate.push({
        userId,
        accountId: matchedAccount.id,
        categoryId: matchedCategory?.id || null,
        type,
        amount,
        currency,
        exchangeRateUsed: req.user?.usdToMvrRate || 15.42,
        payee,
        description: row.description || row.Description || 'Imported statement transaction',
        notes: row.notes || row.Notes || null,
        date: parsedDate,
        isRecurring: false,
      });
    }

    if (txRecordsToCreate.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid transaction records could be extracted from provided CSV rows.',
      });
    }

    await prisma.$transaction(async (tx) => {
      for (const [accId, delta] of Object.entries(accountBalanceDeltas)) {
        if (delta > 0) {
          await tx.account.update({
            where: { id: accId },
            data: { balance: { increment: delta } },
          });
        } else if (delta < 0) {
          await tx.account.update({
            where: { id: accId },
            data: { balance: { decrement: Math.abs(delta) } },
          });
        }
      }

      await tx.transaction.createMany({
        data: txRecordsToCreate,
      });
    });

    res.status(201).json({
      success: true,
      importedCount: txRecordsToCreate.length,
      message: `Successfully imported ${txRecordsToCreate.length} transactions.`,
    });
  } catch (err) {
    next(err);
  }
}

export async function restoreJSONBackup(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { backup } = req.body;

    if (!backup || !backup.data) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup file structure.',
      });
    }

    const { goals = [], bills = [] } = backup.data;

    // 1. Batch process Savings Goals
    const existingGoals = await prisma.savingsGoal.findMany({
      where: { userId },
      select: { name: true },
    });
    const existingGoalNames = new Set(existingGoals.map((g) => g.name.toLowerCase().trim()));

    const newGoalsToCreate = [];
    for (const g of goals) {
      const gName = String(g.name || '').trim();
      if (!gName || existingGoalNames.has(gName.toLowerCase())) continue;
      existingGoalNames.add(gName.toLowerCase());
      newGoalsToCreate.push({
        userId,
        name: gName,
        targetAmount: Number(g.targetAmount) || 1000,
        currentAmount: Number(g.currentAmount) || 0,
        targetDate: g.targetDate ? new Date(g.targetDate) : null,
        color: g.color || '#8B5CF6',
        icon: g.icon || 'piggy-bank',
        description: g.description || null,
      });
    }

    if (newGoalsToCreate.length > 0) {
      await prisma.savingsGoal.createMany({ data: newGoalsToCreate });
    }
    const restoredGoals = newGoalsToCreate.length;

    // 2. Batch process Bills
    const existingBills = await prisma.bill.findMany({
      where: { userId },
      select: { name: true },
    });
    const existingBillNames = new Set(existingBills.map((b) => b.name.toLowerCase().trim()));

    const newBillsToCreate = [];
    for (const b of bills) {
      const bName = String(b.name || '').trim();
      if (!bName || existingBillNames.has(bName.toLowerCase())) continue;
      existingBillNames.add(bName.toLowerCase());
      newBillsToCreate.push({
        userId,
        name: bName,
        amount: Number(b.amount) || 10,
        frequency: (b.frequency as RecurringFrequency) || 'MONTHLY',
        dueDate: b.dueDate ? new Date(b.dueDate) : new Date(),
        dueDay: b.dueDay || 1,
        status: (b.status as BillStatus) || 'UPCOMING',
        isSubscription: Boolean(b.isSubscription),
        autoPay: Boolean(b.autoPay),
      });
    }

    if (newBillsToCreate.length > 0) {
      await prisma.bill.createMany({ data: newBillsToCreate });
    }
    const restoredBills = newBillsToCreate.length;

    res.json({
      success: true,
      message: `Backup restored successfully (${restoredGoals} new goals, ${restoredBills} new bills merged).`,
    });
  } catch (err) {
    next(err);
  }
}
