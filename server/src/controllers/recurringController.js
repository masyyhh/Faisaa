import prisma from '../prisma/client.js';
import { recurringSchema } from '../validators/schemas.js';
import { advanceNextOccurrence, processDueRecurringForUser } from '../services/recurringEngine.js';

export async function getRecurringTransactions(req, res, next) {
  try {
    const items = await prisma.recurringTransaction.findMany({
      where: { userId: req.user.id },
      orderBy: [{ isActive: 'desc' }, { nextOccurrence: 'asc' }],
      include: {
        account: { select: { id: true, name: true, type: true, color: true, currency: true } },
        category: { select: { id: true, name: true, type: true, icon: true, color: true } },
      },
    });

    res.json({
      success: true,
      recurringTransactions: items,
    });
  } catch (err) {
    next(err);
  }
}

export async function createRecurringTransaction(req, res, next) {
  try {
    const userId = req.user.id;
    const parsed = recurringSchema.parse(req.body);

    const acc = await prisma.account.findFirst({ where: { id: parsed.accountId, userId } });
    if (!acc) {
      return res.status(403).json({
        success: false,
        message: 'Selected account not found or unauthorized.',
      });
    }

    if (parsed.categoryId) {
      const cat = await prisma.category.findFirst({ where: { id: parsed.categoryId, userId } });
      if (!cat) {
        return res.status(403).json({
          success: false,
          message: 'Selected category not found or unauthorized.',
        });
      }
    }

    const startDate = new Date(parsed.startDate);
    const nextOccurrence = parsed.nextOccurrence ? new Date(parsed.nextOccurrence) : startDate;

    const created = await prisma.recurringTransaction.create({
      data: {
        userId: req.user.id,
        accountId: parsed.accountId,
        categoryId: parsed.categoryId || null,
        type: parsed.type,
        amount: parsed.amount,
        currency: parsed.currency || acc.currency || 'MVR',
        payee: parsed.payee,
        description: parsed.description || null,
        frequency: parsed.frequency,
        startDate,
        endDate: parsed.endDate ? new Date(parsed.endDate) : null,
        nextOccurrence,
        isActive: parsed.isActive !== undefined ? parsed.isActive : true,
      },
      include: {
        account: true,
        category: true,
      },
    });

    res.status(201).json({
      success: true,
      recurringTransaction: created,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateRecurringTransaction(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await prisma.recurringTransaction.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Recurring transaction not found.',
      });
    }

    const parsed = recurringSchema.partial().parse(req.body);
    const updated = await prisma.recurringTransaction.update({
      where: { id },
      data: {
        ...(parsed.accountId ? { accountId: parsed.accountId } : {}),
        ...(parsed.categoryId !== undefined ? { categoryId: parsed.categoryId } : {}),
        ...(parsed.type ? { type: parsed.type } : {}),
        ...(parsed.amount !== undefined ? { amount: parsed.amount } : {}),
        ...(parsed.currency ? { currency: parsed.currency } : {}),
        ...(parsed.payee ? { payee: parsed.payee } : {}),
        ...(parsed.description !== undefined ? { description: parsed.description } : {}),
        ...(parsed.frequency ? { frequency: parsed.frequency } : {}),
        ...(parsed.startDate ? { startDate: new Date(parsed.startDate) } : {}),
        ...(parsed.endDate !== undefined
          ? { endDate: parsed.endDate ? new Date(parsed.endDate) : null }
          : {}),
        ...(parsed.nextOccurrence ? { nextOccurrence: new Date(parsed.nextOccurrence) } : {}),
        ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {}),
      },
      include: { account: true, category: true },
    });

    res.json({
      success: true,
      recurringTransaction: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function processRecurringTransactionNow(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await prisma.recurringTransaction.findFirst({
      where: { id, userId: req.user.id },
      include: { account: true, category: true },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Recurring transaction not found.',
      });
    }

    const nextDate = advanceNextOccurrence(existing.nextOccurrence, existing.frequency);
    const willDeactivate = existing.endDate ? nextDate > existing.endDate : false;
    const currency = existing.currency || existing.account?.currency || 'MVR';

    const result = await prisma.$transaction(async (tx) => {
      if (existing.type === 'INCOME') {
        await tx.account.update({
          where: { id: existing.accountId },
          data: { balance: { increment: existing.amount } },
        });
      } else {
        await tx.account.update({
          where: { id: existing.accountId },
          data: { balance: { decrement: existing.amount } },
        });
      }

      const createdTx = await tx.transaction.create({
        data: {
          userId: req.user.id,
          accountId: existing.accountId,
          categoryId: existing.categoryId,
          type: existing.type,
          amount: existing.amount,
          currency,
          exchangeRateUsed: req.user.usdToMvrRate || 15.42,
          payee: existing.payee,
          description: existing.description || `Recurring ${existing.frequency.toLowerCase()} payment`,
          date: new Date(),
          isRecurring: true,
          recurringId: existing.id,
        },
        include: { account: true, category: true },
      });

      const updatedRecurring = await tx.recurringTransaction.update({
        where: { id },
        data: {
          nextOccurrence: nextDate,
          isActive: !willDeactivate,
        },
        include: { account: true, category: true },
      });

      return { createdTx, updatedRecurring };
    });

    res.json({
      success: true,
      message: 'Recurring transaction processed and account balance updated.',
      transaction: result.createdTx,
      recurringTransaction: result.updatedRecurring,
    });
  } catch (err) {
    next(err);
  }
}

export async function processDueTransactions(req, res, next) {
  try {
    const result = await processDueRecurringForUser(req.user.id);
    res.json({
      success: true,
      message: `Processed ${result.processedCount} due recurring transaction(s).`,
      processedCount: result.processedCount,
      transactions: result.transactions,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteRecurringTransaction(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await prisma.recurringTransaction.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Recurring transaction not found.',
      });
    }

    await prisma.recurringTransaction.delete({ where: { id } });

    res.json({
      success: true,
      message: 'Recurring transaction deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}
