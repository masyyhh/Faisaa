import type { Request, Response, NextFunction } from 'express';
import prisma from '../prisma/client.js';
import { categorySchema } from '../validators/schemas.js';
import { cacheGet, cacheSet, invalidateUserCategories } from '../utils/cache.js';

export async function getCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const cacheKey = `user:${userId}:categories`;

    const cached = await cacheGet<unknown[]>(cacheKey);
    if (cached) {
      res.json({
        success: true,
        categories: cached,
        cached: true,
      });
      return;
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const categories = await prisma.category.findMany({
      where: { userId },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: {
        transactions: {
          where: { date: { gte: startOfMonth } },
          select: { amount: true, currency: true },
        },
        _count: {
          select: { transactions: true },
        },
      },
    });

    const rate = Number(req.user!.usdToMvrRate || 15.42);
    const formatted = categories.map((c) => {
      const monthlyTotal = Number(
        c.transactions
          .reduce(
            (sum: number, t: { amount: number; currency: string }) =>
              sum + (t.currency === 'USD' ? t.amount * rate : t.amount),
            0
          )
          .toFixed(2)
      );
      const { transactions, ...rest } = c;
      return {
        ...rest,
        monthlyTotal,
        transactionCount: c._count.transactions,
      };
    });

    await cacheSet(cacheKey, formatted, 3600); // 1-hour TTL

    res.json({
      success: true,
      categories: formatted,
    });
  } catch (err) {
    next(err);
  }
}

export async function createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = categorySchema.parse(req.body);
    const category = await prisma.category.create({
      data: {
        ...parsed,
        userId: req.user!.id,
        isDefault: false,
      },
    });

    await invalidateUserCategories(req.user!.id);

    res.status(201).json({
      success: true,
      category,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const existing = await prisma.category.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Category not found.',
      });
      return;
    }

    const parsed = categorySchema.partial().parse(req.body);
    const updated = await prisma.category.update({
      where: { id },
      data: parsed,
    });

    await invalidateUserCategories(req.user!.id);

    res.json({
      success: true,
      category: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const existing = await prisma.category.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Category not found.',
      });
      return;
    }

    await prisma.category.delete({ where: { id } });
    await invalidateUserCategories(req.user!.id);

    res.json({
      success: true,
      message: 'Category deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}
