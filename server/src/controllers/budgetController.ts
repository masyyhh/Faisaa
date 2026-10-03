import type { Request, Response, NextFunction } from 'express';
import prisma from '../prisma/client.js';
import { budgetSchema } from '../validators/schemas.js';

function getBudgetStatusState(pct: number, alertThreshold: number = 80): string {
  if (pct >= 100) return 'over_budget';
  if (pct >= 90) return 'near_limit';
  if (pct >= alertThreshold) return 'warning';
  return 'normal';
}

export async function getBudgets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const now = new Date();
    const month = req.query.month ? parseInt(req.query.month as string, 10) : now.getMonth() + 1;
    const year = req.query.year ? parseInt(req.query.year as string, 10) : now.getFullYear();

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
    const startOfSixMonths = new Date(year, month - 6, 1);

    const rate = Number(req.user!.usdToMvrRate || 15.42);
    const [budgets, allRecentBudgets, sixMonthExpenses] = await Promise.all([
      prisma.budget.findMany({
        where: { userId, month, year },
        include: {
          category: true,
          items: true,
        },
        orderBy: { amount: 'desc' },
      }),
      prisma.budget.findMany({
        where: { userId },
        select: { month: true, year: true, amount: true },
      }),
      prisma.transaction.findMany({
        where: {
          userId,
          type: 'EXPENSE',
          date: { gte: startOfSixMonths, lte: endOfMonth },
        },
        select: {
          categoryId: true,
          amount: true,
          currency: true,
          date: true,
          account: { select: { currency: true } },
        },
      }),
    ]);

    const spentByCategory: Record<string, number> = {};
    for (const tx of sixMonthExpenses) {
      const dt = new Date(tx.date);
      if (dt >= startOfMonth && dt <= endOfMonth && tx.categoryId) {
        const txCurr = tx.currency || tx.account?.currency || 'MVR';
        const mvrAmt = txCurr === 'USD' ? tx.amount * rate : tx.amount;
        spentByCategory[tx.categoryId] = (spentByCategory[tx.categoryId] || 0) + mvrAmt;
      }
    }

    const enriched = budgets.map((b) => {
      const spent = Number((spentByCategory[b.categoryId] || 0).toFixed(2));
      const remaining = Number(Math.max(0, b.amount - spent).toFixed(2));
      const overAmount = spent > b.amount ? Number((spent - b.amount).toFixed(2)) : 0;
      const percentage = b.amount > 0 ? Number(((spent / b.amount) * 100).toFixed(1)) : 0;
      const statusState = getBudgetStatusState(percentage, b.alertThreshold);

      return {
        ...b,
        spent,
        remaining,
        overAmount,
        percentage,
        statusState,
      };
    });

    const totalBudgeted = enriched.reduce((s, b) => s + b.amount, 0);
    const totalSpent = enriched.reduce((s, b) => s + b.spent, 0);
    const totalRemaining = Math.max(0, totalBudgeted - totalSpent);
    const overallPercentage =
      totalBudgeted > 0 ? Number(((totalSpent / totalBudgeted) * 100).toFixed(1)) : 0;

    // 6-month historical budget performance computed in O(N) memory without N+1 DB queries
    const history = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      const endD = new Date(year, month - i, 0, 23, 59, 59, 999);
      const hMonth = d.getMonth() + 1;
      const hYear = d.getFullYear();

      const monthBudgets = allRecentBudgets.filter(
        (b) => b.month === hMonth && b.year === hYear
      );
      const budgetedSum =
        monthBudgets.length > 0
          ? monthBudgets.reduce((s, b) => s + b.amount, 0)
          : totalBudgeted || 4140;

      const spentSum = sixMonthExpenses
        .filter((tx) => {
          const dt = new Date(tx.date);
          return dt >= d && dt <= endD;
        })
        .reduce((s, tx) => {
          const txCurr = tx.currency || tx.account?.currency || 'MVR';
          return s + (txCurr === 'USD' ? tx.amount * rate : tx.amount);
        }, 0);

      history.push({
        month: d.toLocaleString('en-US', { month: 'short' }),
        budgeted: Number(budgetedSum.toFixed(2)),
        spent: Number(spentSum.toFixed(2)),
      });
    }

    res.json({
      success: true,
      month,
      year,
      budgets: enriched,
      summary: {
        totalBudgeted,
        totalSpent,
        totalRemaining,
        overallPercentage,
        overBudgetCount: enriched.filter((b) => b.statusState === 'over_budget').length,
        warningCount: enriched.filter((b) =>
          ['warning', 'near_limit'].includes(b.statusState)
        ).length,
      },
      history,
    });
  } catch (err) {
    next(err);
  }
}

export async function createBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const parsed = budgetSchema.parse(req.body);
    const now = new Date();
    const month = parsed.month || now.getMonth() + 1;
    const year = parsed.year || now.getFullYear();

    const category = await prisma.category.findFirst({
      where: { id: parsed.categoryId, userId },
    });

    if (!category) {
      res.status(404).json({
        success: false,
        message: 'Selected category not found.',
      });
      return;
    }

    const budget = await prisma.budget.upsert({
      where: {
        userId_categoryId_month_year: {
          userId,
          categoryId: parsed.categoryId,
          month,
          year,
        },
      },
      update: {
        name: parsed.name || `${category.name} Budget`,
        amount: parsed.amount,
        alertThreshold: parsed.alertThreshold || 80,
        color: parsed.color || category.color,
      },
      create: {
        userId,
        name: parsed.name || `${category.name} Budget`,
        categoryId: parsed.categoryId,
        amount: parsed.amount,
        month,
        year,
        alertThreshold: parsed.alertThreshold || 80,
        color: parsed.color || category.color,
      },
      include: { category: true },
    });

    res.status(201).json({
      success: true,
      budget,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const existing = await prisma.budget.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Budget not found.',
      });
      return;
    }

    const parsed = budgetSchema.partial().parse(req.body);

    if (parsed.categoryId && parsed.categoryId !== existing.categoryId) {
      const duplicate = await prisma.budget.findFirst({
        where: {
          userId: req.user!.id,
          categoryId: parsed.categoryId,
          month: existing.month,
          year: existing.year,
        },
      });
      if (duplicate) {
        res.status(400).json({
          success: false,
          message: 'A budget for this category already exists in this month.',
        });
        return;
      }
    }

    const updated = await prisma.budget.update({
      where: { id },
      data: {
        ...(parsed.name ? { name: parsed.name } : {}),
        ...(parsed.amount !== undefined ? { amount: parsed.amount } : {}),
        ...(parsed.alertThreshold !== undefined ? { alertThreshold: parsed.alertThreshold } : {}),
        ...(parsed.color !== undefined ? { color: parsed.color } : {}),
        ...(parsed.categoryId ? { categoryId: parsed.categoryId } : {}),
      },
      include: { category: true },
    });

    res.json({
      success: true,
      budget: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const existing = await prisma.budget.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Budget not found.',
      });
      return;
    }

    await prisma.budget.delete({ where: { id } });

    res.json({
      success: true,
      message: 'Budget deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}
