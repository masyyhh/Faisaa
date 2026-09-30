import { z } from 'zod';

export const registerSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(60),
  lastName: z.string().min(1, 'Last name is required').max(60),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  currency: z.enum(['MVR', 'USD']).optional().default('MVR'),
});

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const profileUpdateSchema = z.object({
  firstName: z.string().min(1).max(60).optional(),
  lastName: z.string().min(1).max(60).optional(),
  email: z.string().email().optional(),
  currency: z.enum(['MVR', 'USD']).optional(),
  secondaryCurrency: z.enum(['USD', 'MVR']).optional(),
  usdToMvrRate: z.coerce.number().positive().max(1000).optional(),
  dateFormat: z.string().optional(),
  theme: z.enum(['dark', 'light']).optional(),
  notifyBudgetAlerts: z.boolean().optional(),
  notifyBillReminders: z.boolean().optional(),
  notifyGoalMilestones: z.boolean().optional(),
  telegramEnabled: z.boolean().optional(),
  telegramBotToken: z.string().optional().nullable(),
  telegramChatId: z.string().optional().nullable(),
  hideBalances: z.boolean().optional(),
});

export const passwordUpdateSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

export const accountSchema = z.object({
  name: z.string().min(1, 'Account name is required').max(80),
  type: z.enum(['CASH', 'CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT', 'LOAN', 'OTHER']),
  balance: z.coerce.number(),
  currency: z.enum(['MVR', 'USD']).optional().default('MVR'),
  color: z.string().optional().default('#8B5CF6'),
  icon: z.string().optional().default('landmark'),
  institution: z.string().optional().nullable(),
  lastFour: z.string().max(4).optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export const transferSchema = z.object({
  fromAccountId: z.string().min(1, 'Source account is required'),
  toAccountId: z.string().min(1, 'Destination account is required'),
  amount: z.coerce.number().positive('Transfer amount must be greater than zero'),
  date: z.string().optional(),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const transactionSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  transferToAccountId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  currency: z.enum(['MVR', 'USD']).optional(),
  payee: z.string().min(1, 'Payee / Merchant is required').max(120),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  date: z.string().min(1, 'Date is required'),
  isRecurring: z.boolean().optional().default(false),
  tags: z.array(z.string()).optional().default([]),
});

export const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(60),
  type: z.enum(['INCOME', 'EXPENSE']),
  icon: z.string().optional().default('tag'),
  color: z.string().optional().default('#8B5CF6'),
});

export const budgetSchema = z.object({
  name: z.string().min(1, 'Budget name is required').optional(),
  categoryId: z.string().min(1, 'Category is required'),
  amount: z.coerce.number().positive('Budget limit must be greater than zero'),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2020).max(2050).optional(),
  alertThreshold: z.coerce.number().min(10).max(100).optional().default(80),
  color: z.string().optional().nullable(),
});

export const goalSchema = z.object({
  name: z.string().min(1, 'Goal name is required').max(80),
  targetAmount: z.coerce.number().positive('Target amount must be greater than zero'),
  currentAmount: z.coerce.number().min(0).optional().default(0),
  targetDate: z.string().optional().nullable(),
  color: z.string().optional().default('#8B5CF6'),
  icon: z.string().optional().default('piggy-bank'),
  description: z.string().optional().nullable(),
  milestones: z
    .array(
      z.object({
        label: z.string(),
        amount: z.coerce.number(),
        reached: z.boolean().optional(),
      })
    )
    .optional(),
});

export const recurringSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  categoryId: z.string().optional().nullable(),
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: z.coerce.number().positive('Amount must be positive'),
  payee: z.string().min(1, 'Payee is required'),
  description: z.string().optional().nullable(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().optional().nullable(),
  nextOccurrence: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

export const billSchema = z.object({
  accountId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  name: z.string().min(1, 'Bill name is required'),
  amount: z.coerce.number().positive('Amount must be positive'),
  frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']),
  dueDate: z.string().min(1, 'Due date is required'),
  dueDay: z.coerce.number().int().min(1).max(31).optional().default(1),
  status: z.enum(['UPCOMING', 'PAID', 'OVERDUE', 'PAUSED']).optional().default('UPCOMING'),
  isSubscription: z.boolean().optional().default(true),
  autoPay: z.boolean().optional().default(false),
  website: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
