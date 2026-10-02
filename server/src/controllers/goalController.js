import prisma from '../prisma/client.js';
import { goalSchema } from '../validators/schemas.js';

function enrichGoal(goal) {
  const percentage =
    goal.targetAmount > 0
      ? Number(Math.min(100, (goal.currentAmount / goal.targetAmount) * 100).toFixed(1))
      : 0;
  const remainingAmount = Number(Math.max(0, goal.targetAmount - goal.currentAmount).toFixed(2));

  let milestones = [];
  if (goal.milestonesJson) {
    try {
      milestones = JSON.parse(goal.milestonesJson).map((m) => ({
        ...m,
        reached: goal.currentAmount >= m.amount,
      }));
    } catch {
      milestones = [];
    }
  } else {
    milestones = [
      { label: '25% Milestone', amount: goal.targetAmount * 0.25, reached: percentage >= 25 },
      { label: '50% Halfway', amount: goal.targetAmount * 0.5, reached: percentage >= 50 },
      { label: '75% Almost There', amount: goal.targetAmount * 0.75, reached: percentage >= 75 },
      { label: '100% Goal Reached', amount: goal.targetAmount, reached: percentage >= 100 },
    ];
  }

  let daysRemaining = null;
  let monthlyNeeded = null;
  if (goal.targetDate) {
    const diffMs = new Date(goal.targetDate).getTime() - Date.now();
    daysRemaining = Math.max(0, Math.ceil(diffMs / 86400000));
    const monthsRemaining = Math.max(1, daysRemaining / 30);
    monthlyNeeded = Number((remainingAmount / monthsRemaining).toFixed(2));
  }

  return {
    ...goal,
    percentage,
    remainingAmount,
    milestones,
    daysRemaining,
    monthlyNeeded,
  };
}

export async function getGoals(req, res, next) {
  try {
    const goals = await prisma.savingsGoal.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'asc' },
    });

    const enriched = goals.map(enrichGoal);
    const totalSaved = enriched.reduce((s, g) => s + g.currentAmount, 0);
    const totalTarget = enriched.reduce((s, g) => s + g.targetAmount, 0);

    res.json({
      success: true,
      goals: enriched,
      summary: {
        totalSaved,
        totalTarget,
        overallPercentage:
          totalTarget > 0 ? Number(((totalSaved / totalTarget) * 100).toFixed(1)) : 0,
        completedCount: enriched.filter((g) => g.percentage >= 100).length,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createGoal(req, res, next) {
  try {
    const parsed = goalSchema.parse(req.body);
    const defaultMilestones = parsed.milestones || [
      { label: '25% Saved', amount: Number((parsed.targetAmount * 0.25).toFixed(2)), reached: false },
      { label: '50% Halfway', amount: Number((parsed.targetAmount * 0.5).toFixed(2)), reached: false },
      { label: '75% Milestone', amount: Number((parsed.targetAmount * 0.75).toFixed(2)), reached: false },
      { label: '100% Complete', amount: parsed.targetAmount, reached: false },
    ];

    const goal = await prisma.savingsGoal.create({
      data: {
        userId: req.user.id,
        name: parsed.name,
        targetAmount: parsed.targetAmount,
        currentAmount: parsed.currentAmount || 0,
        targetDate: parsed.targetDate ? new Date(parsed.targetDate) : null,
        color: parsed.color || '#8B5CF6',
        icon: parsed.icon || 'piggy-bank',
        description: parsed.description || null,
        milestonesJson: JSON.stringify(defaultMilestones),
      },
    });

    res.status(201).json({
      success: true,
      goal: enrichGoal(goal),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateGoal(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await prisma.savingsGoal.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Savings goal not found.',
      });
    }

    const parsed = goalSchema.partial().parse(req.body);
    const updated = await prisma.savingsGoal.update({
      where: { id },
      data: {
        ...(parsed.name ? { name: parsed.name } : {}),
        ...(parsed.targetAmount !== undefined ? { targetAmount: parsed.targetAmount } : {}),
        ...(parsed.currentAmount !== undefined ? { currentAmount: parsed.currentAmount } : {}),
        ...(parsed.targetDate !== undefined
          ? { targetDate: parsed.targetDate ? new Date(parsed.targetDate) : null }
          : {}),
        ...(parsed.color ? { color: parsed.color } : {}),
        ...(parsed.icon ? { icon: parsed.icon } : {}),
        ...(parsed.description !== undefined ? { description: parsed.description } : {}),
        ...(parsed.milestones ? { milestonesJson: JSON.stringify(parsed.milestones) } : {}),
      },
    });

    res.json({
      success: true,
      goal: enrichGoal(updated),
    });
  } catch (err) {
    next(err);
  }
}

export async function contributeToGoal(req, res, next) {
  try {
    const { id } = req.params;
    const { amount, action = 'ADD', accountId } = req.body;
    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than zero.',
      });
    }

    const existing = await prisma.savingsGoal.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Savings goal not found.',
      });
    }

    if (action === 'WITHDRAW' && existing.currentAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot withdraw from a goal with zero funds.',
      });
    }

    const effectiveAmount =
      action === 'WITHDRAW'
        ? Math.min(existing.currentAmount, numericAmount)
        : numericAmount;

    const newAmount =
      action === 'WITHDRAW'
        ? Math.max(0, existing.currentAmount - effectiveAmount)
        : existing.currentAmount + numericAmount;

    const updated = await prisma.$transaction(async (tx) => {
      if (accountId) {
        const account = await tx.account.findFirst({
          where: { id: accountId, userId: req.user.id },
        });
        if (account) {
          await tx.account.update({
            where: { id: account.id },
            data: {
              balance:
                action === 'WITHDRAW'
                  ? { increment: effectiveAmount }
                  : { decrement: numericAmount },
            },
          });
        }
      }

      return tx.savingsGoal.update({
        where: { id },
        data: { currentAmount: newAmount },
      });
    });

    const oldPct = (existing.currentAmount / existing.targetAmount) * 100;
    const newPct = (updated.currentAmount / updated.targetAmount) * 100;

    if (oldPct < 50 && newPct >= 50 && newPct < 100) {
      await prisma.notification.create({
        data: {
          userId: req.user.id,
          title: `Goal Milestone: ${updated.name}`,
          message: `You reached ${Math.round(newPct)}% of your ${updated.name} goal!`,
          type: 'GOAL_MILESTONE',
          severity: 'SUCCESS',
          actionUrl: '/goals',
        },
      });
    } else if (oldPct < 100 && newPct >= 100) {
      await prisma.notification.create({
        data: {
          userId: req.user.id,
          title: `Goal Completed: ${updated.name}!`,
          message: `Congratulations! You reached 100% (${updated.targetAmount.toLocaleString()}) of your ${updated.name} goal!`,
          type: 'GOAL_MILESTONE',
          severity: 'SUCCESS',
          actionUrl: '/goals',
        },
      });
    }

    res.json({
      success: true,
      goal: enrichGoal(updated),
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteGoal(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await prisma.savingsGoal.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Savings goal not found.',
      });
    }

    await prisma.savingsGoal.delete({ where: { id } });

    res.json({
      success: true,
      message: 'Savings goal deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}
