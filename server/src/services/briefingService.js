import prisma from '../prisma/client.js';
import { sendTelegramNotification } from './telegramService.js';

/**
 * Generate comprehensive daily financial briefing data for a user.
 */
export async function getBriefingData(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      accounts: { where: { isActive: true } },
    },
  });

  if (!user) return null;

  const now = new Date();
  const rate = user.usdToMvrRate || 18.45;

  // 1. Account Balances
  let mvrTotal = 0;
  let usdTotal = 0;

  for (const acc of user.accounts) {
    if (acc.currency === 'USD') {
      usdTotal += acc.balance;
    } else {
      mvrTotal += acc.balance;
    }
  }

  const netLiquidityMvr = mvrTotal + usdTotal * rate;

  // 2. Yesterday's Spending
  const yesterdayStart = new Date(now);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);

  const yesterdayEnd = new Date(now);
  yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
  yesterdayEnd.setHours(23, 59, 59, 999);

  const yesterdayTx = await prisma.transaction.findMany({
    where: {
      userId,
      type: 'EXPENSE',
      date: {
        gte: yesterdayStart,
        lte: yesterdayEnd,
      },
    },
  });

  const yesterdaySpendMvr = yesterdayTx.reduce((sum, tx) => {
    const amt = tx.currency === 'USD' ? tx.amount * rate : tx.amount;
    return sum + amt;
  }, 0);

  // 3. Upcoming Bills (Due within next 48 hours or overdue)
  const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const upcomingBills = await prisma.bill.findMany({
    where: {
      userId,
      status: { in: ['UPCOMING', 'OVERDUE'] },
      dueDate: { lte: in48Hours },
    },
    orderBy: { dueDate: 'asc' },
    include: { category: true },
  });

  // 4. Recurring Transactions due today
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const dueRecurring = await prisma.recurringTransaction.findMany({
    where: {
      userId,
      isActive: true,
      nextOccurrence: { lte: endOfToday },
    },
    include: { account: true },
  });

  // 5. Budgets nearing threshold
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const budgets = await prisma.budget.findMany({
    where: {
      userId,
      month: currentMonth,
      year: currentYear,
    },
    include: {
      category: true,
      items: true,
    },
  });

  // Calculate actual spending for each budget's category this month
  const startOfMonth = new Date(currentYear, currentMonth - 1, 1);
  const warningBudgets = [];

  for (const b of budgets) {
    const catExpenses = await prisma.transaction.findMany({
      where: {
        userId,
        categoryId: b.categoryId,
        type: 'EXPENSE',
        date: { gte: startOfMonth, lte: now },
      },
    });

    const totalSpent = catExpenses.reduce((sum, tx) => {
      const amt = tx.currency === 'USD' ? tx.amount * rate : tx.amount;
      return sum + amt;
    }, 0);

    const percentage = b.amount > 0 ? (totalSpent / b.amount) * 100 : 0;
    if (percentage >= b.alertThreshold) {
      warningBudgets.push({
        name: b.name || b.category?.name,
        spent: totalSpent,
        budget: b.amount,
        percentage: Math.round(percentage),
      });
    }
  }

  return {
    user,
    now,
    rate,
    mvrTotal,
    usdTotal,
    netLiquidityMvr,
    yesterdaySpendMvr,
    yesterdayTxCount: yesterdayTx.length,
    upcomingBills,
    dueRecurring,
    warningBudgets,
  };
}

/**
 * Format a daily briefing Markdown text suitable for Telegram and notifications.
 */
export function formatBriefingMarkdown(data) {
  const {
    user,
    now,
    rate,
    mvrTotal,
    usdTotal,
    netLiquidityMvr,
    yesterdaySpendMvr,
    yesterdayTxCount,
    upcomingBills,
    dueRecurring,
    warningBudgets,
  } = data;

  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  let text = `🌅 *Good morning, ${user.firstName}!* 👋\n`;
  text += `Here is your *Faisaa Financial Briefing* for *${dateStr}*:\n\n`;

  // Liquid Balances
  text += `💰 *Liquid Balances:*\n`;
  text += `• MVR: *MVR ${mvrTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*\n`;
  text += `• USD: *$${usdTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*\n`;
  text += `• Total Net Liquidity: *MVR ${netLiquidityMvr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}* _(Rate: $1 = ${rate.toFixed(2)})_\n\n`;

  // Yesterday spend
  text += `📊 *Yesterday's Spend:*\n`;
  text += `• *MVR ${yesterdaySpendMvr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}* across ${yesterdayTxCount} transaction${yesterdayTxCount === 1 ? '' : 's'}\n\n`;

  // Upcoming Bills
  if (upcomingBills && upcomingBills.length > 0) {
    text += `⚠️ *Bills Due (Next 48h / Overdue):*\n`;
    for (const bill of upcomingBills) {
      const isOverdue = new Date(bill.dueDate) < now;
      const dueLabel = isOverdue ? '❗ OVERDUE' : 'Due Soon';
      text += `• ${bill.name}: *MVR ${bill.amount.toFixed(2)}* (${dueLabel})\n`;
    }
    text += '\n';
  } else {
    text += `✅ *No urgent bills due in the next 48 hours.*\n\n`;
  }

  // Due Recurring
  if (dueRecurring && dueRecurring.length > 0) {
    text += `🔄 *Scheduled Transactions Today:*\n`;
    for (const r of dueRecurring) {
      text += `• ${r.payee}: *${r.currency || 'MVR'} ${r.amount.toFixed(2)}* (${r.type.toLowerCase()})\n`;
    }
    text += '\n';
  }

  // Budget warnings
  if (warningBudgets && warningBudgets.length > 0) {
    text += `🚨 *Budget Warnings:*\n`;
    for (const bg of warningBudgets) {
      text += `• ${bg.name}: *${bg.percentage}%* used (MVR ${bg.spent.toFixed(0)} / ${bg.budget.toFixed(0)})\n`;
    }
    text += '\n';
  }

  text += `_Faisaa Online • Have a prosperous day!_`;

  return text;
}

/**
 * Send the daily briefing to a user (via Telegram and in-app Notification).
 */
export async function sendDailyBriefing(userId, options = {}) {
  const data = await getBriefingData(userId);
  if (!data) return { sent: false, reason: 'User not found' };

  const markdown = formatBriefingMarkdown(data);

  // 1. In-app Notification
  const hasUrgent = data.upcomingBills.length > 0 || data.warningBudgets.length > 0;
  await prisma.notification.create({
    data: {
      userId,
      title: '🌅 Your Daily Financial Briefing',
      message: `Total Liquidity: MVR ${data.netLiquidityMvr.toFixed(2)}. Yesterday spend: MVR ${data.yesterdaySpendMvr.toFixed(2)}. ${data.upcomingBills.length} bill(s) due soon.`,
      type: hasUrgent ? 'BILL_DUE' : 'SYSTEM',
      severity: hasUrgent ? 'WARNING' : 'INFO',
      actionUrl: '/dashboard',
    },
  });

  // 2. Telegram message
  let telegramResult = { sent: false, reason: 'Telegram disabled or not configured' };
  if (data.user.telegramEnabled || options.forceTelegram) {
    telegramResult = await sendTelegramNotification(
      data.user,
      'Daily Financial Briefing',
      markdown,
      {
        botToken: options.botToken,
        chatId: options.chatId,
        force: options.forceTelegram,
      }
    );
  }

  return {
    sent: true,
    data,
    markdown,
    telegram: telegramResult,
  };
}

/**
 * Check and send bill reminder alerts for upcoming bills (within 24-48h).
 */
export async function checkAndSendBillReminders(userId) {
  const now = new Date();
  const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const bills = await prisma.bill.findMany({
    where: {
      userId,
      status: 'UPCOMING',
      dueDate: { lte: in48Hours },
    },
    include: {
      user: true,
      category: true,
    },
  });

  const remindersSent = [];

  for (const bill of bills) {
    // Avoid spamming multiple reminders on the same day
    const alreadyNotified = await prisma.notification.findFirst({
      where: {
        userId,
        type: 'BILL_DUE',
        message: { contains: bill.name },
        createdAt: {
          gte: new Date(now.setHours(0, 0, 0, 0)),
        },
      },
    });

    if (alreadyNotified) continue;

    const diffHours = Math.round((new Date(bill.dueDate) - new Date()) / (1000 * 60 * 60));
    const dueInText = diffHours <= 24 ? 'within 24 hours' : 'in 2 days';

    await prisma.notification.create({
      data: {
        userId,
        title: `Bill Due Reminder: ${bill.name}`,
        message: `Your payment of MVR ${bill.amount.toFixed(2)} for ${bill.name} is due ${dueInText}.`,
        type: 'BILL_DUE',
        severity: 'WARNING',
        actionUrl: '/bills',
      },
    });

    if (bill.user?.telegramEnabled) {
      await sendTelegramNotification(
        bill.user,
        'Bill Due Reminder',
        `⚠️ *Bill Reminder:* Your payment of *MVR ${bill.amount.toFixed(2)}* for *${bill.name}* is due *${dueInText}*.\n\nOpen Faisaa to settle: https://faisaa.io/bills`
      );
    }

    remindersSent.push(bill.id);
  }

  return remindersSent;
}
