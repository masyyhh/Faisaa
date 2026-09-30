import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__finoraPrisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__finoraPrisma = prisma;
}

// Enable SQLite WAL mode & memory-mapped cache for high-concurrency read/write performance
export async function initDatabasePragmas() {
  try {
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
    await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;');
    await prisma.$queryRawUnsafe('PRAGMA temp_store = MEMORY;');
    await prisma.$queryRawUnsafe('PRAGMA cache_size = -64000;');
    await prisma.$queryRawUnsafe('PRAGMA foreign_keys = ON;');
  } catch {
    // Non-SQLite provider (e.g., PostgreSQL) ignores SQLite PRAGMAs
  }
}

export const DEFAULT_CATEGORIES = [
  // Income Categories
  { name: 'Salary', type: 'INCOME', icon: 'briefcase', color: '#10B981', isDefault: true },
  { name: 'Freelance', type: 'INCOME', icon: 'laptop', color: '#34D399', isDefault: true },
  { name: 'Business', type: 'INCOME', icon: 'building-2', color: '#059669', isDefault: true },
  { name: 'Investment', type: 'INCOME', icon: 'trending-up', color: '#8B5CF6', isDefault: true },
  { name: 'Interest', type: 'INCOME', icon: 'percent', color: '#6366F1', isDefault: true },
  { name: 'Gift', type: 'INCOME', icon: 'gift', color: '#EC4899', isDefault: true },
  { name: 'Other Income', type: 'INCOME', icon: 'plus-circle', color: '#14B8A6', isDefault: true },

  // Expense Categories
  { name: 'Food & Dining', type: 'EXPENSE', icon: 'utensils', color: '#F59E0B', isDefault: true },
  { name: 'Groceries', type: 'EXPENSE', icon: 'shopping-cart', color: '#10B981', isDefault: true },
  { name: 'Shopping', type: 'EXPENSE', icon: 'shopping-bag', color: '#EC4899', isDefault: true },
  { name: 'Transportation', type: 'EXPENSE', icon: 'car', color: '#3B82F6', isDefault: true },
  { name: 'Housing', type: 'EXPENSE', icon: 'home', color: '#8B5CF6', isDefault: true },
  { name: 'Utilities', type: 'EXPENSE', icon: 'zap', color: '#06B6D4', isDefault: true },
  { name: 'Entertainment', type: 'EXPENSE', icon: 'film', color: '#A855F7', isDefault: true },
  { name: 'Healthcare', type: 'EXPENSE', icon: 'heart-pulse', color: '#EF4444', isDefault: true },
  { name: 'Education', type: 'EXPENSE', icon: 'graduation-cap', color: '#6366F1', isDefault: true },
  { name: 'Travel', type: 'EXPENSE', icon: 'plane', color: '#0EA5E9', isDefault: true },
  { name: 'Subscriptions', type: 'EXPENSE', icon: 'repeat', color: '#D946EF', isDefault: true },
  { name: 'Insurance', type: 'EXPENSE', icon: 'shield-check', color: '#64748B', isDefault: true },
  { name: 'Personal', type: 'EXPENSE', icon: 'user', color: '#F97316', isDefault: true },
  { name: 'Other Expense', type: 'EXPENSE', icon: 'more-horizontal', color: '#94A3B8', isDefault: true },
];

export async function ensureDefaultCategoriesForUser(userId) {
  const existingCount = await prisma.category.count({ where: { userId } });
  if (existingCount > 0) return;

  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({
      ...c,
      userId,
    })),
  });
}

export default prisma;
