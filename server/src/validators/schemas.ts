import { z } from 'zod';

export const passwordComplexitySchema = z
  .string()
  .min(10, 'Password must be at least 10 characters long')
  .max(128, 'Password cannot exceed 128 characters')
  .refine((val) => /[a-z]/.test(val), {
    message: 'Password must contain at least one lowercase letter',
  })
  .refine((val) => /[A-Z]/.test(val), {
    message: 'Password must contain at least one uppercase letter',
  })
  .refine((val) => /[0-9]/.test(val), {
    message: 'Password must contain at least one number',
  })
  .refine((val) => /[^a-zA-Z0-9]/.test(val), {
    message: 'Password must contain at least one special symbol (!@#$%^&*...)',
  });

export const sanitizeLastFour = (val: unknown): string | null => {
  if (!val) return null;
  const digits = String(val).replace(/\D/g, '');
  return digits.length > 4 ? digits.slice(-4) : digits || null;
};

export const registerSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(60),
  lastName: z.string().min(1, 'Last name is required').max(60),
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username can only contain letters, numbers, underscores, dots, and hyphens')
    .optional()
    .nullable(),
  email: z.string().email('Please enter a valid email address'),
  password: passwordComplexitySchema,
  currency: z.enum(['MVR', 'USD']).optional().default('MVR'),
});

export const loginSchema = z
  .object({
    email: z.string().trim().min(1, 'Please enter your email or username').optional(),
    username: z.string().trim().min(1).optional(),
    identifier: z.string().trim().min(1).optional(),
    password: z.string().min(1, 'Password is required'),
  })
  .refine((data) => Boolean(data.email || data.username || data.identifier), {
    message: 'Please enter your email or username',
    path: ['email'],
  });

export const profileUpdateSchema = z.object({
  firstName: z.string().min(1).max(60).optional(),
  lastName: z.string().min(1).max(60).optional(),
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username can only contain letters, numbers, underscores, dots, and hyphens')
    .optional()
    .nullable(),
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
  newPassword: passwordComplexitySchema,
});

export const forgotPasswordRequestSchema = z.object({
  identifier: z.string().trim().min(1, 'Please enter your email or username'),
});

export const resetPasswordConfirmSchema = z.object({
  identifier: z.string().trim().min(1, 'Please enter your email or username'),
  code: z.string().trim().min(4, 'Please enter the verification code'),
  newPassword: passwordComplexitySchema,
});

export const accountSchema = z.object({
  name: z.string().min(1, 'Account name is required').max(80),
  type: z.enum(['CASH', 'CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT', 'LOAN', 'OTHER']),
  balance: z.coerce.number(),
  currency: z.enum(['MVR', 'USD']).optional().default('MVR'),
  color: z.string().optional().default('#8B5CF6'),
  icon: z.string().optional().default('landmark'),
  institution: z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable().transform(sanitizeLastFour),
  lastFour: z.string().optional().nullable().transform(sanitizeLastFour),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
  isDefault: z.boolean().optional().default(false),
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
  icon: z.string().min(1, 'Icon name is required'),
  color: z.string().min(1, 'Color hex code is required'),
});

export const budgetSchema = z.object({
  name: z.string().min(1, 'Budget name is required').max(80).optional(),
  categoryId: z.string().min(1, 'Category is required'),
  amount: z.coerce.number().positive('Budget amount must be positive'),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  alertThreshold: z.coerce.number().min(1).max(100).optional().default(80),
  color: z.string().optional().nullable(),
});

export const goalSchema = z.object({
  name: z.string().min(1, 'Goal name is required').max(80),
  targetAmount: z.coerce.number().positive('Target amount must be greater than zero'),
  currentAmount: z.coerce.number().min(0).default(0),
  targetDate: z.string().optional().nullable(),
  currency: z.enum(['MVR', 'USD']).optional().default('MVR'),
  color: z.string().optional().default('#10B981'),
  icon: z.string().optional().default('target'),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  milestones: z.array(z.object({
    label: z.string(),
    amount: z.number(),
    reached: z.boolean().optional(),
  })).optional(),
});

export const goalContributionSchema = z.object({
  amount: z.coerce.number().positive('Contribution amount must be greater than zero'),
  accountId: z.string().optional().nullable(),
  date: z.string().optional(),
  notes: z.string().optional().nullable(),
});

export const recurringTransactionSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  categoryId: z.string().optional().nullable(),
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: z.coerce.number().positive('Amount must be positive'),
  currency: z.enum(['MVR', 'USD']).optional().default('MVR'),
  payee: z.string().min(1, 'Payee is required').max(120),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
  interval: z.coerce.number().int().positive().default(1),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().optional().nullable(),
  nextOccurrence: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  description: z.string().optional().nullable(),
  autoProcess: z.boolean().optional().default(true),
});
export const recurringSchema = recurringTransactionSchema;

export const billSchema = z.object({
  name: z.string().min(1, 'Bill name is required').max(80),
  amount: z.coerce.number().positive('Amount must be positive'),
  currency: z.enum(['MVR', 'USD']).optional().default('MVR'),
  dueDate: z.string().min(1, 'Due date is required'),
  frequency: z.enum(['ONE_TIME', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']).default('MONTHLY'),
  categoryId: z.string().optional().nullable(),
  accountId: z.string().optional().nullable(),
  reminderDays: z.coerce.number().int().min(0).max(30).default(3),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
  status: z.enum(['UPCOMING', 'OVERDUE', 'PAID', 'PAUSED']).optional().default('UPCOMING'),
  isSubscription: z.boolean().optional().default(true),
  autoPay: z.boolean().optional().default(false),
  website: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const currencyExchangeSchema = z.object({
  fromAccountId: z.string().min(1, 'Source account is required'),
  toAccountId: z.string().min(1, 'Destination account is required'),
  fromAmount: z.coerce.number().positive('From amount must be positive'),
  fromCurrency: z.enum(['MVR', 'USD']),
  toAmount: z.coerce.number().positive('To amount must be positive'),
  toCurrency: z.enum(['MVR', 'USD']),
  exchangeRate: z.coerce.number().positive('Exchange rate must be positive'),
  date: z.string().optional(),
  notes: z.string().optional().nullable(),
});

export const exchangeRateUpdateSchema = z.object({
  rate: z.coerce.number().positive('Rate must be a positive number').max(1000),
  note: z.string().max(120).optional().nullable(),
});

export const loanSchema = z.object({
  name: z.string().min(1, 'Loan name is required').max(100),
  type: z.enum(['OWED_BY_ME', 'OWED_TO_ME']),
  category: z
    .enum([
      'PERSONAL_LOAN',
      'VEHICLE',
      'MORTGAGE',
      'STUDENT',
      'CREDIT_CARD',
      'FRIENDS_FAMILY',
      'ISLAMIC_FINANCING',
      'OTHER',
    ])
    .optional()
    .default('PERSONAL_LOAN'),
  lender: z.string().max(100).optional().nullable(),
  originalAmount: z.coerce.number().positive('Original amount must be greater than 0'),
  remainingBalance: z.coerce.number().min(0, 'Remaining balance cannot be negative').optional(),
  interestRate: z.coerce.number().min(0).max(100).optional().default(0),
  minimumPayment: z.coerce.number().min(0).optional().default(0),
  currency: z.enum(['MVR', 'USD']).optional().default('MVR'),
  startDate: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  dueDay: z.coerce.number().min(1).max(31).optional().default(1),
  accountId: z.string().optional().nullable(),
  color: z.string().optional().default('#6366F1'),
  notes: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'PAID_OFF', 'ARCHIVED']).optional().default('ACTIVE'),
});

export const loanPaymentSchema = z.object({
  amount: z.coerce.number().positive('Payment amount must be greater than 0'),
  principalAmount: z.coerce.number().min(0).optional(),
  interestAmount: z.coerce.number().min(0).optional(),
  accountId: z.string().optional().nullable(),
  date: z.string().optional(),
  notes: z.string().optional().nullable(),
});

// Explicit DTO Types Inferred from Zod Schemas
export type RegisterDTO = z.infer<typeof registerSchema>;
export type LoginDTO = z.infer<typeof loginSchema>;
export type ProfileUpdateDTO = z.infer<typeof profileUpdateSchema>;
export type PasswordUpdateDTO = z.infer<typeof passwordUpdateSchema>;
export type AccountDTO = z.infer<typeof accountSchema>;
export type TransferDTO = z.infer<typeof transferSchema>;
export type TransactionDTO = z.infer<typeof transactionSchema>;
export type CategoryDTO = z.infer<typeof categorySchema>;
export type BudgetDTO = z.infer<typeof budgetSchema>;
export type GoalDTO = z.infer<typeof goalSchema>;
export type GoalContributionDTO = z.infer<typeof goalContributionSchema>;
export type RecurringTransactionDTO = z.infer<typeof recurringTransactionSchema>;
export type BillDTO = z.infer<typeof billSchema>;
export type CurrencyExchangeDTO = z.infer<typeof currencyExchangeSchema>;
export type ExchangeRateUpdateDTO = z.infer<typeof exchangeRateUpdateSchema>;
export type LoanDTO = z.infer<typeof loanSchema>;
export type LoanPaymentDTO = z.infer<typeof loanPaymentSchema>;
