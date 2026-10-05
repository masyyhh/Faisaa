import 'dotenv/config';
import bcrypt from 'bcryptjs';
import type { Category, Tag } from '@prisma/client';
import prisma, { DEFAULT_CATEGORIES } from './client.js';
import { encrypt } from '../utils/crypto.js';

export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
export type BillStatus = 'UPCOMING' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export async function seedDatabase() {
  console.log('🌱 Starting Faisaa (MVR & USD Edition) database seed...');

  const encryptedBotToken = process.env.TELEGRAM_BOT_TOKEN
    ? encrypt(process.env.TELEGRAM_BOT_TOKEN.trim())
    : null;

  const existingUser =
    (await prisma.user.findUnique({ where: { email: 'alex@faisaa.online' } })) ||
    (await prisma.user.findUnique({ where: { email: 'alex@faisaa.io' } })) ||
    (await prisma.user.findUnique({ where: { email: 'alex@finora.io' } }));

  if (existingUser) {
    // Ensure telegram credentials, username & MVR base currency are synced
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        username: existingUser.username || 'alex',
        currency: 'MVR',
        secondaryCurrency: 'USD',
        usdToMvrRate: existingUser.usdToMvrRate || 18.45,
        telegramEnabled: true,
        telegramBotToken: encryptedBotToken || existingUser.telegramBotToken,
        telegramChatId: process.env.TELEGRAM_CHAT_ID || null,
      },
    });
    console.log(`✅ Demo user (${existingUser.email}) already exists. Skipping duplicate seed.`);
    return existingUser;
  }

  const passwordHash = await bcrypt.hash('Password123!', 12);

  const user = await prisma.user.create({
    data: {
      firstName: 'Alex',
      lastName: 'Morgan',
      username: 'alex',
      email: 'alex@faisaa.online',
      passwordHash,
      currency: 'MVR',
      secondaryCurrency: 'USD',
      usdToMvrRate: 18.45,
      dateFormat: 'MMM dd, yyyy',
      theme: 'dark',
      notifyBudgetAlerts: true,
      notifyBillReminders: true,
      notifyGoalMilestones: true,
      telegramEnabled: true,
      telegramBotToken: encryptedBotToken,
      telegramChatId: process.env.TELEGRAM_CHAT_ID || null,
      hideBalances: false,
    },
  });

  // 1. Create Categories
  const categoryMap: Record<string, Category> = {};
  for (const cat of DEFAULT_CATEGORIES) {
    const created = await prisma.category.create({
      data: {
        ...cat,
        userId: user.id,
      },
    });
    categoryMap[cat.name] = created;
  }

  // 2. Create Multi-Currency Accounts (MVR Base + USD Secondary)
  const bmlMvr = await prisma.account.create({
    data: {
      userId: user.id,
      name: 'BML MVR Checking',
      type: 'CHECKING',
      balance: 145200.0,
      initialBalance: 110000.0,
      currency: 'MVR',
      color: '#8B5CF6',
      icon: 'landmark',
      institution: 'Bank of Maldives',
      lastFour: '4829',
      notes: 'Primary MVR salary & local Rufiyaa expenses',
      isActive: true,
    },
  });

  const bmlUsd = await prisma.account.create({
    data: {
      userId: user.id,
      name: 'BML USD Account',
      type: 'SAVINGS',
      balance: 4250.0,
      initialBalance: 3000.0,
      currency: 'USD',
      color: '#10B981',
      icon: 'piggy-bank',
      institution: 'Bank of Maldives (USD)',
      lastFour: '9104',
      notes: 'USD freelance retainers & foreign currency reserve ($)',
      isActive: true,
    },
  });

  const mibSavings = await prisma.account.create({
    data: {
      userId: user.id,
      name: 'MIB MVR Savings',
      type: 'SAVINGS',
      balance: 320000.0,
      initialBalance: 260000.0,
      currency: 'MVR',
      color: '#06B6D4',
      icon: 'piggy-bank',
      institution: 'Maldives Islamic Bank',
      lastFour: '6612',
      notes: 'Long-term MVR wealth reserve',
      isActive: true,
    },
  });

  const vanguardUsd = await prisma.account.create({
    data: {
      userId: user.id,
      name: 'Vanguard USD Index',
      type: 'INVESTMENT',
      balance: 18400.0,
      initialBalance: 15000.0,
      currency: 'USD',
      color: '#3B82F6',
      icon: 'trending-up',
      institution: 'Vanguard Brokerage ($)',
      lastFour: '7721',
      notes: 'S&P 500 VOO portfolio denominated in USD ($)',
      isActive: true,
    },
  });

  const usdCard = await prisma.account.create({
    data: {
      userId: user.id,
      name: 'Sapphire USD Card',
      type: 'CREDIT_CARD',
      balance: -640.0,
      initialBalance: -320.0,
      currency: 'USD',
      color: '#EC4899',
      icon: 'credit-card',
      institution: 'International USD Visa',
      lastFour: '3318',
      notes: 'International subscriptions & travel card ($)',
      isActive: true,
    },
  });

  const cashMvr = await prisma.account.create({
    data: {
      userId: user.id,
      name: 'MVR Cash Wallet',
      type: 'CASH',
      balance: 8450.0,
      initialBalance: 6000.0,
      currency: 'MVR',
      color: '#F59E0B',
      icon: 'wallet',
      institution: 'Physical Rufiyaa Cash',
      lastFour: '0001',
      notes: 'Daily cafés, ferry & local markets',
      isActive: true,
    },
  });

  const autoLoanMvr = await prisma.account.create({
    data: {
      userId: user.id,
      name: 'MIB Auto Financing',
      type: 'LOAN',
      balance: -114000.0,
      initialBalance: -165000.0,
      currency: 'MVR',
      color: '#EF4444',
      icon: 'car',
      institution: 'Maldives Islamic Bank',
      lastFour: '5502',
      notes: 'Vehicle Murabaha facility in MVR',
      isActive: true,
    },
  });

  // 3. Seed ExchangeRateHistory & CurrencyExchanges
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const ratePoints = [
    { rate: 15.42, note: 'Official BML Peg Rate', daysAgo: 25 },
    { rate: 17.85, note: 'Market USD Rate Update', daysAgo: 18 },
    { rate: 18.10, note: 'Parallel Market Adjustment', daysAgo: 12 },
    { rate: 18.30, note: 'FX Exchange Execution Rate', daysAgo: 6 },
    { rate: 18.45, note: 'Current Live USD → MVR Rate', daysAgo: 1 },
  ];

  for (const rp of ratePoints) {
    await prisma.exchangeRateHistory.create({
      data: {
        userId: user.id,
        rate: rp.rate,
        note: rp.note,
        createdAt: new Date(now.getTime() - rp.daysAgo * 86400000),
      },
    });
  }

  await prisma.currencyExchange.createMany({
    data: [
      {
        userId: user.id,
        fromAccountId: bmlUsd.id,
        toAccountId: bmlMvr.id,
        fromCurrency: 'USD',
        toCurrency: 'MVR',
        fromAmount: 500.0,
        toAmount: 9150.0,
        exchangeRate: 18.30,
        notes: 'Converted USD retainer to MVR for local rent & expenses',
        date: new Date(now.getTime() - 6 * 86400000),
      },
      {
        userId: user.id,
        fromAccountId: bmlUsd.id,
        toAccountId: bmlMvr.id,
        fromCurrency: 'USD',
        toCurrency: 'MVR',
        fromAmount: 1200.0,
        toAmount: 22140.0,
        exchangeRate: 18.45,
        notes: 'Exchanged $1,200 USD at 18.45 MVR market rate',
        date: new Date(now.getTime() - 2 * 86400000),
      },
    ],
  });

  // 4. Create Tags
  const tagNames = [
    { name: 'Essential', color: '#3B82F6' },
    { name: 'USD-FX', color: '#10B981' },
    { name: 'Recurring', color: '#8B5CF6' },
    { name: 'Work', color: '#F59E0B' },
    { name: 'Leisure', color: '#EC4899' },
  ];
  const tagMap: Record<string, Tag> = {};
  for (const t of tagNames) {
    tagMap[t.name] = await prisma.tag.create({
      data: { userId: user.id, name: t.name, color: t.color },
    });
  }

  const d = (monthOffset: number, day: number, hour = 12) => {
    const date = new Date(currentYear, currentMonth - monthOffset, day, hour, 15, 0);
    if (date > now && monthOffset === 0) {
      return new Date(now.getTime() - (day % 5) * 86400000);
    }
    return date;
  };

  interface SeedTxData {
    accountId: string;
    categoryId: string;
    type: TransactionType;
    amount: number;
    currency: string;
    exchangeRateUsed: number;
    payee: string;
    description: string;
    date: Date;
    isRecurring: boolean;
    tags: string[];
  }

  // 5. Create Transactions (in both MVR and USD)
  const transactionsData: SeedTxData[] = [
    {
      accountId: bmlMvr.id,
      categoryId: categoryMap['Salary'].id,
      type: 'INCOME',
      amount: 68500.0,
      currency: 'MVR',
      exchangeRateUsed: 18.45,
      payee: 'Executive Engineering Payroll (MVR)',
      description: 'Monthly salary credited to BML MVR',
      date: d(0, 1, 9),
      isRecurring: true,
      tags: ['Essential', 'Work'],
    },
    {
      accountId: bmlUsd.id,
      categoryId: categoryMap['Freelance'].id,
      type: 'INCOME',
      amount: 1850.0,
      currency: 'USD',
      exchangeRateUsed: 18.45,
      payee: 'Stripe International Client ($)',
      description: 'Global fintech design advisory retainer in USD',
      date: d(0, 12, 14),
      isRecurring: false,
      tags: ['USD-FX', 'Work'],
    },
    {
      accountId: bmlMvr.id,
      categoryId: categoryMap['Housing'].id,
      type: 'EXPENSE',
      amount: 24500.0,
      currency: 'MVR',
      exchangeRateUsed: 18.45,
      payee: 'Hulhumalé Oceanfront Apartment Rent',
      description: 'Monthly 2BR apartment rent',
      date: d(0, 2, 8),
      isRecurring: true,
      tags: ['Essential', 'Recurring'],
    },
    {
      accountId: bmlMvr.id,
      categoryId: categoryMap['Groceries'].id,
      type: 'EXPENSE',
      amount: 4850.0,
      currency: 'MVR',
      exchangeRateUsed: 18.45,
      payee: 'Villa Mart & Redwave Mega',
      description: 'Weekly household groceries & fresh produce',
      date: d(0, 8, 17),
      isRecurring: false,
      tags: ['Essential'],
    },
    {
      accountId: cashMvr.id,
      categoryId: categoryMap['Food & Dining'].id,
      type: 'EXPENSE',
      amount: 2680.0,
      currency: 'MVR',
      exchangeRateUsed: 18.45,
      payee: 'Meraki Coffee Roasters & Salt Café',
      description: 'Specialty coffee & team dinners',
      date: d(0, 15, 19),
      isRecurring: false,
      tags: ['Leisure'],
    },
    {
      accountId: usdCard.id,
      categoryId: categoryMap['Subscriptions'].id,
      type: 'EXPENSE',
      amount: 39.98,
      currency: 'USD',
      exchangeRateUsed: 18.45,
      payee: 'Netflix 4K & Spotify Duo (USD)',
      description: 'International USD streaming subscriptions',
      date: d(0, 10, 11),
      isRecurring: true,
      tags: ['Recurring', 'USD-FX'],
    },
    {
      accountId: usdCard.id,
      categoryId: categoryMap['Shopping'].id,
      type: 'EXPENSE',
      amount: 299.0,
      currency: 'USD',
      exchangeRateUsed: 18.45,
      payee: 'Apple Store & Amazon Global ($)',
      description: 'Tech accessories & SSD hardware',
      date: d(0, 18, 16),
      isRecurring: false,
      tags: ['Work', 'USD-FX'],
    },
    {
      accountId: bmlMvr.id,
      categoryId: categoryMap['Utilities'].id,
      type: 'EXPENSE',
      amount: 3420.0,
      currency: 'MVR',
      exchangeRateUsed: 18.45,
      payee: 'STELCO Electric & Dhiraagu Fiber',
      description: 'Monthly electricity, MWSC water & 1Gbps fiber',
      date: d(0, 11, 9),
      isRecurring: true,
      tags: ['Essential', 'Recurring'],
    },
  ];

  // Historical Months (Months -1 to -5) in MVR
  const historicalMonths = [
    { offset: 1, salary: 68500, freelanceUsd: 1400, rent: 24500, groceries: 5200, dining: 3100, utilities: 3350 },
    { offset: 2, salary: 68500, freelanceUsd: 1900, rent: 24500, groceries: 4950, dining: 3400, utilities: 3500 },
    { offset: 3, salary: 65000, freelanceUsd: 1200, rent: 24500, groceries: 5100, dining: 2900, utilities: 3200 },
    { offset: 4, salary: 65000, freelanceUsd: 1550, rent: 24500, groceries: 4750, dining: 3150, utilities: 3100 },
    { offset: 5, salary: 65000, freelanceUsd: 1100, rent: 24500, groceries: 4800, dining: 2800, utilities: 3150 },
  ];

  for (const m of historicalMonths) {
    transactionsData.push(
      {
        accountId: bmlMvr.id,
        categoryId: categoryMap['Salary'].id,
        type: 'INCOME',
        amount: m.salary,
        currency: 'MVR',
        exchangeRateUsed: 18.45,
        payee: 'Executive Engineering Payroll (MVR)',
        description: 'Monthly MVR salary',
        date: d(m.offset, 1, 9),
        isRecurring: true,
        tags: ['Essential'],
      },
      {
        accountId: bmlUsd.id,
        categoryId: categoryMap['Freelance'].id,
        type: 'INCOME',
        amount: m.freelanceUsd,
        currency: 'USD',
        exchangeRateUsed: 18.45,
        payee: 'Stripe International Advisory ($)',
        description: 'USD consulting income',
        date: d(m.offset, 14, 14),
        isRecurring: false,
        tags: ['USD-FX'],
      },
      {
        accountId: bmlMvr.id,
        categoryId: categoryMap['Housing'].id,
        type: 'EXPENSE',
        amount: m.rent,
        currency: 'MVR',
        exchangeRateUsed: 18.45,
        payee: 'Hulhumalé Oceanfront Apartment Rent',
        description: 'Monthly apartment rent',
        date: d(m.offset, 2, 9),
        isRecurring: true,
        tags: ['Essential'],
      },
      {
        accountId: bmlMvr.id,
        categoryId: categoryMap['Groceries'].id,
        type: 'EXPENSE',
        amount: m.groceries,
        currency: 'MVR',
        exchangeRateUsed: 18.45,
        payee: 'Villa Mart & Redwave',
        description: 'Monthly household groceries',
        date: d(m.offset, 10, 16),
        isRecurring: false,
        tags: ['Essential'],
      },
      {
        accountId: cashMvr.id,
        categoryId: categoryMap['Food & Dining'].id,
        type: 'EXPENSE',
        amount: m.dining,
        currency: 'MVR',
        exchangeRateUsed: 18.45,
        payee: 'Meraki Coffee & Local Dining',
        description: 'Dining out & cafés',
        date: d(m.offset, 16, 19),
        isRecurring: false,
        tags: ['Leisure'],
      },
      {
        accountId: bmlMvr.id,
        categoryId: categoryMap['Utilities'].id,
        type: 'EXPENSE',
        amount: m.utilities,
        currency: 'MVR',
        exchangeRateUsed: 18.45,
        payee: 'STELCO & Dhiraagu Fiber',
        description: 'Power, water & fiber internet',
        date: d(m.offset, 11, 10),
        isRecurring: true,
        tags: ['Essential'],
      }
    );
  }

  for (const tx of transactionsData) {
    const { tags = [], ...txFields } = tx;
    const createdTx = await prisma.transaction.create({
      data: {
        ...txFields,
        userId: user.id,
      },
    });
    for (const tagName of tags) {
      if (tagMap[tagName]) {
        await prisma.transactionTag.create({
          data: {
            transactionId: createdTx.id,
            tagId: tagMap[tagName].id,
          },
        });
      }
    }
  }

  // 6. Monthly Budgets in MVR
  const mNum = now.getMonth() + 1;
  const yNum = now.getFullYear();
  const budgetsData = [
    { name: 'Housing & Rent', categoryName: 'Housing', amount: 25000, alertThreshold: 90, color: '#8B5CF6' },
    { name: 'Groceries & Market', categoryName: 'Groceries', amount: 6500, alertThreshold: 80, color: '#10B981' },
    { name: 'Food & Dining', categoryName: 'Food & Dining', amount: 3500, alertThreshold: 80, color: '#F59E0B' },
    { name: 'Shopping & Tech', categoryName: 'Shopping', amount: 5000, alertThreshold: 80, color: '#EC4899' },
    { name: 'Utilities & Fiber', categoryName: 'Utilities', amount: 4000, alertThreshold: 85, color: '#06B6D4' },
  ];

  for (const b of budgetsData) {
    const cat = categoryMap[b.categoryName];
    if (cat) {
      await prisma.budget.create({
        data: {
          userId: user.id,
          name: b.name,
          month: mNum,
          year: yNum,
          categoryId: cat.id,
          amount: b.amount,
          alertThreshold: b.alertThreshold,
          color: b.color,
        },
      });
    }
  }

  // 7. Savings Goals in MVR
  const goalsData = [
    {
      name: 'Emergency Reserve Fund',
      targetAmount: 150000,
      currentAmount: 98500,
      targetDate: new Date(currentYear + 1, 2, 1),
      color: '#8B5CF6',
      icon: 'shield-check',
      description: '6 months of living expenses in MVR & USD reserve',
    },
    {
      name: 'Japan Autumn Vacation (USD/MVR)',
      targetAmount: 85000,
      currentAmount: 62000,
      targetDate: new Date(currentYear, 11, 15),
      color: '#06B6D4',
      icon: 'plane',
      description: 'Flights & Tokyo/Kyoto stays',
    },
    {
      name: 'MacBook Pro M4 Max Workstation',
      targetAmount: 55000,
      currentAmount: 46500,
      targetDate: new Date(currentYear, currentMonth + 2, 1),
      color: '#10B981',
      icon: 'laptop',
      description: '64GB Studio upgrade',
    },
  ];

  for (const g of goalsData) {
    await prisma.savingsGoal.create({
      data: {
        ...g,
        userId: user.id,
      },
    });
  }

  interface SeedBillData {
    accountId: string;
    categoryId: string;
    name: string;
    amount: number;
    frequency: RecurringFrequency;
    dueDate: Date;
    dueDay: number;
    status: BillStatus;
    isSubscription: boolean;
    autoPay: boolean;
  }

  // 8. Bills & Subscriptions
  const billsData: SeedBillData[] = [
    {
      accountId: bmlMvr.id,
      categoryId: categoryMap['Housing'].id,
      name: 'Hulhumalé Apartment Rent',
      amount: 24500,
      frequency: 'MONTHLY',
      dueDate: new Date(currentYear, currentMonth + 1, 1),
      dueDay: 1,
      status: 'PAID',
      isSubscription: false,
      autoPay: true,
    },
    {
      accountId: bmlMvr.id,
      categoryId: categoryMap['Utilities'].id,
      name: 'Dhiraagu 1Gbps Fiber Internet',
      amount: 1890,
      frequency: 'MONTHLY',
      dueDate: new Date(now.getTime() + 2 * 86400000),
      dueDay: 28,
      status: 'UPCOMING',
      isSubscription: true,
      autoPay: true,
    },
    {
      accountId: bmlMvr.id,
      categoryId: categoryMap['Utilities'].id,
      name: 'STELCO Electricity Bill',
      amount: 1530,
      frequency: 'MONTHLY',
      dueDate: new Date(now.getTime() - 1 * 86400000),
      dueDay: 25,
      status: 'OVERDUE',
      isSubscription: false,
      autoPay: false,
    },
  ];

  for (const bill of billsData) {
    await prisma.bill.create({
      data: {
        ...bill,
        userId: user.id,
      },
    });
  }

  // 9. Notifications
  await prisma.notification.createMany({
    data: [
      {
        userId: user.id,
        title: 'Live Exchange Rate Active: $1 = MVR 18.45',
        message: 'All USD accounts ($22,010.00 net USD) are dynamically valued in MVR on your Dashboard.',
        type: 'SYSTEM',
        severity: 'INFO',
        actionUrl: '/',
      },
      {
        userId: user.id,
        title: 'Over Budget Alert: Shopping & Tech',
        message: 'Your USD hardware purchase ($299 = MVR 5,516.55) pushed Shopping over the MVR 5,000 limit.',
        type: 'BUDGET_OVER',
        severity: 'DANGER',
        actionUrl: '/budgets',
      },
    ],
  });

  console.log('✨ Faisaa MVR & USD seed completed!');
  return user;
}

if (process.argv[1] && (process.argv[1].endsWith('seed.js') || process.argv[1].endsWith('seed.ts'))) {
  seedDatabase()
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
