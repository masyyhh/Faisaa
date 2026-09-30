import prisma from '../prisma/client.js';
import { categorySchema } from '../validators/schemas.js';

export async function getCategories(req, res, next) {
  try {
    const userId = req.user.id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const categories = await prisma.category.findMany({
      where: { userId },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: {
        transactions: {
          where: { date: { gte: startOfMonth } },
          select: { amount: true },
        },
        _count: {
          select: { transactions: true },
        },
      },
    });

    const formatted = categories.map((c) => {
      const monthlyTotal = c.transactions.reduce((sum, t) => sum + t.amount, 0);
      const { transactions, ...rest } = c;
      return {
        ...rest,
        monthlyTotal,
        transactionCount: c._count.transactions,
      };
    });

    res.json({
      success: true,
      categories: formatted,
    });
  } catch (err) {
    next(err);
  }
}

export async function createCategory(req, res, next) {
  try {
    const parsed = categorySchema.parse(req.body);
    const category = await prisma.category.create({
      data: {
        ...parsed,
        userId: req.user.id,
        isDefault: false,
      },
    });

    res.status(201).json({
      success: true,
      category,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateCategory(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await prisma.category.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Category not found.',
      });
    }

    const parsed = categorySchema.partial().parse(req.body);
    const updated = await prisma.category.update({
      where: { id },
      data: parsed,
    });

    res.json({
      success: true,
      category: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await prisma.category.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Category not found.',
      });
    }

    await prisma.category.delete({ where: { id } });

    res.json({
      success: true,
      message: 'Category deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}
