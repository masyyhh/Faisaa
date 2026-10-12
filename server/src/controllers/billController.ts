import type { Request, Response, NextFunction } from 'express';
import prisma from '../prisma/client.js';
import { billSchema } from '../validators/schemas.js';

function normalizeMonthlyEquivalent(amount: number, frequency: string): number {
  switch (frequency) {
    case 'WEEKLY':
      return amount * (52 / 12);
    case 'BIWEEKLY':
      return amount * (26 / 12);
    case 'MONTHLY':
      return amount;
    case 'QUARTERLY':
      return amount / 3;
    case 'YEARLY':
      return amount / 12;
    default:
      return amount;
  }
}

export async function getBills(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const now = new Date();

    const bills = await prisma.bill.findMany({
      where: { userId },
      orderBy: { dueDate: 'asc' },
      include: {
        account: { select: { id: true, name: true, type: true, color: true } },
        category: { select: { id: true, name: true, type: true, icon: true, color: true } },
      },
    });

    const enriched = bills.map((bill) => {
      const due = new Date(bill.dueDate);
      const diffDays = Math.ceil((due.getTime() - now.getTime()) / 86400000);
      let computedStatus = bill.status;
      if (bill.status === 'UPCOMING' && diffDays < 0) {
        computedStatus = 'OVERDUE';
      }
      const monthlyEquivalent = Number(normalizeMonthlyEquivalent(bill.amount, bill.frequency).toFixed(2));
      return {
        ...bill,
        status: computedStatus,
        daysUntilDue: diffDays,
        monthlyEquivalent,
        yearlyEquivalent: Number((monthlyEquivalent * 12).toFixed(2)),
      };
    });

    const activeBills = enriched.filter((b) => b.status !== 'PAUSED');
    const monthlyRecurringCost = Number(
      activeBills.reduce((s, b) => s + b.monthlyEquivalent, 0).toFixed(2)
    );
    const yearlyRecurringCost = Number((monthlyRecurringCost * 12).toFixed(2));

    res.json({
      success: true,
      bills: enriched,
      summary: {
        monthlyRecurringCost,
        yearlyRecurringCost,
        upcomingCount: enriched.filter((b) => b.status === 'UPCOMING').length,
        overdueCount: enriched.filter((b) => b.status === 'OVERDUE').length,
        paidCount: enriched.filter((b) => b.status === 'PAID').length,
        subscriptionCount: enriched.filter((b) => b.isSubscription && b.status !== 'PAUSED').length,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createBill(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const parsed = billSchema.parse(req.body);

    if (parsed.accountId) {
      const acc = await prisma.account.findFirst({ where: { id: parsed.accountId, userId } });
      if (!acc) {
        res.status(403).json({
          success: false,
          message: 'Selected account not found or unauthorized.',
        });
        return;
      }
    }

    if (parsed.categoryId) {
      const cat = await prisma.category.findFirst({ where: { id: parsed.categoryId, userId } });
      if (!cat) {
        res.status(403).json({
          success: false,
          message: 'Selected category not found or unauthorized.',
        });
        return;
      }
    }

    const dueDate = new Date(parsed.dueDate);

    const created = await prisma.bill.create({
      data: {
        userId: req.user!.id,
        accountId: parsed.accountId || null,
        categoryId: parsed.categoryId || null,
        name: parsed.name,
        amount: parsed.amount,
        frequency: parsed.frequency,
        dueDate,
        dueDay: parsed.dueDay || dueDate.getDate(),
        status: parsed.status || 'UPCOMING',
        isSubscription: parsed.isSubscription !== undefined ? parsed.isSubscription : true,
        autoPay: Boolean(parsed.autoPay),
        website: parsed.website || null,
        notes: parsed.notes || null,
      },
      include: { account: true, category: true },
    });

    res.status(201).json({
      success: true,
      bill: created,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateBill(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const existing = await prisma.bill.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Bill not found.',
      });
      return;
    }

    const parsed = billSchema.partial().parse(req.body);
    const updated = await prisma.bill.update({
      where: { id },
      data: {
        ...(parsed.accountId !== undefined ? { accountId: parsed.accountId || null } : {}),
        ...(parsed.categoryId !== undefined ? { categoryId: parsed.categoryId || null } : {}),
        ...(parsed.name ? { name: parsed.name } : {}),
        ...(parsed.amount !== undefined ? { amount: parsed.amount } : {}),
        ...(parsed.frequency ? { frequency: parsed.frequency } : {}),
        ...(parsed.dueDate ? { dueDate: new Date(parsed.dueDate) } : {}),
        ...(parsed.dueDay !== undefined ? { dueDay: parsed.dueDay } : {}),
        ...(parsed.status ? { status: parsed.status } : {}),
        ...(parsed.isSubscription !== undefined ? { isSubscription: parsed.isSubscription } : {}),
        ...(parsed.autoPay !== undefined ? { autoPay: parsed.autoPay } : {}),
        ...(parsed.website !== undefined ? { website: parsed.website } : {}),
        ...(parsed.notes !== undefined ? { notes: parsed.notes } : {}),
      },
      include: { account: true, category: true },
    });

    res.json({
      success: true,
      bill: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function payBill(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const { recordTransaction = true } = req.body;

    const existing = await prisma.bill.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Bill not found.',
      });
      return;
    }

    // Calculate next due date safely preserving dueDay without month drift
    const nextDue = new Date(existing.dueDate);
    const targetDueDay = existing.dueDay || nextDue.getDate();
    if (existing.frequency === 'WEEKLY') {
      nextDue.setDate(nextDue.getDate() + 7);
    } else if (existing.frequency === 'BIWEEKLY') {
      nextDue.setDate(nextDue.getDate() + 14);
    } else {
      const addedMonths =
        existing.frequency === 'QUARTERLY' ? 3 : existing.frequency === 'YEARLY' ? 12 : 1;
      const totalMonths = nextDue.getFullYear() * 12 + nextDue.getMonth() + addedMonths;
      const targetYear = Math.floor(totalMonths / 12);
      const targetMonth = totalMonths % 12;
      const maxDaysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
      const safeDay = Math.min(targetDueDay, maxDaysInTargetMonth);
      nextDue.setFullYear(targetYear, targetMonth, safeDay);
    }

    const targetAccountId = req.body.accountId || existing.accountId;

    const updated = await prisma.$transaction(async (tx) => {
      if (recordTransaction && targetAccountId) {
        const account = await tx.account.findFirst({
          where: { id: targetAccountId, userId: req.user!.id },
        });

        if (account) {
          await tx.account.update({
            where: { id: account.id },
            data: { balance: { decrement: existing.amount } },
          });

          await tx.transaction.create({
            data: {
              userId: req.user!.id,
              accountId: account.id,
              categoryId: existing.categoryId,
              type: 'EXPENSE',
              amount: existing.amount,
              currency: account.currency || 'MVR',
              payee: existing.name,
              description: `Bill payment: ${existing.name}`,
              date: new Date(),
              isRecurring: true,
            },
          });
        }
      }

      return tx.bill.update({
        where: { id },
        data: {
          status: 'UPCOMING',
          lastPaidDate: new Date(),
          dueDate: nextDue,
        },
        include: { account: true, category: true },
      });
    });

    res.json({
      success: true,
      message: `${existing.name} marked as paid.`,
      bill: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteBill(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const existing = await prisma.bill.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Bill not found.',
      });
      return;
    }

    await prisma.bill.delete({ where: { id } });

    res.json({
      success: true,
      message: 'Bill deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}
