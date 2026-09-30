import prisma from '../prisma/client.js';
import { billSchema } from '../validators/schemas.js';

function normalizeMonthlyEquivalent(amount, frequency) {
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

export async function getBills(req, res, next) {
  try {
    const userId = req.user.id;
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

export async function createBill(req, res, next) {
  try {
    const userId = req.user.id;
    const parsed = billSchema.parse(req.body);

    if (parsed.accountId) {
      const acc = await prisma.account.findFirst({ where: { id: parsed.accountId, userId } });
      if (!acc) {
        return res.status(403).json({
          success: false,
          message: 'Selected account not found or unauthorized.',
        });
      }
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

    const dueDate = new Date(parsed.dueDate);

    const created = await prisma.bill.create({
      data: {
        userId: req.user.id,
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

export async function updateBill(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await prisma.bill.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found.',
      });
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

export async function payBill(req, res, next) {
  try {
    const { id } = req.params;
    const { recordTransaction = true } = req.body;

    const existing = await prisma.bill.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found.',
      });
    }

    // Calculate next due date based on frequency
    const nextDue = new Date(existing.dueDate);
    if (existing.frequency === 'WEEKLY') nextDue.setDate(nextDue.getDate() + 7);
    else if (existing.frequency === 'BIWEEKLY') nextDue.setDate(nextDue.getDate() + 14);
    else if (existing.frequency === 'QUARTERLY') nextDue.setMonth(nextDue.getMonth() + 3);
    else if (existing.frequency === 'YEARLY') nextDue.setFullYear(nextDue.getFullYear() + 1);
    else nextDue.setMonth(nextDue.getMonth() + 1);

    const updated = await prisma.$transaction(async (tx) => {
      if (recordTransaction && existing.accountId) {
        await tx.account.update({
          where: { id: existing.accountId },
          data: { balance: { decrement: existing.amount } },
        });

        await tx.transaction.create({
          data: {
            userId: req.user.id,
            accountId: existing.accountId,
            categoryId: existing.categoryId,
            type: 'EXPENSE',
            amount: existing.amount,
            payee: existing.name,
            description: `Bill payment: ${existing.name}`,
            date: new Date(),
            isRecurring: true,
          },
        });
      }

      return tx.bill.update({
        where: { id },
        data: {
          status: 'PAID',
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

export async function deleteBill(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await prisma.bill.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found.',
      });
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
