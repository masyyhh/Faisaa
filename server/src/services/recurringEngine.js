import prisma from '../prisma/client.js';
import { sendTelegramNotification } from './telegramService.js';

export function advanceNextOccurrence(dateInput, frequency) {
  const d = new Date(dateInput);
  switch (frequency) {
    case 'DAILY':
      d.setDate(d.getDate() + 1);
      break;
    case 'WEEKLY':
      d.setDate(d.getDate() + 7);
      break;
    case 'BIWEEKLY':
      d.setDate(d.getDate() + 14);
      break;
    case 'MONTHLY':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'QUARTERLY':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'YEARLY':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      d.setMonth(d.getMonth() + 1);
  }
  return d;
}

/**
 * Process all due recurring transactions for a specific user.
 * @param {string} userId
 * @returns {Promise<{ processedCount: number, transactions: Array }>}
 */
export async function processDueRecurringForUser(userId) {
  const now = new Date();

  // Find all active recurring transactions that have reached or passed their nextOccurrence date
  const dueItems = await prisma.recurringTransaction.findMany({
    where: {
      userId,
      isActive: true,
      nextOccurrence: {
        lte: now,
      },
    },
    include: {
      account: true,
      category: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          usdToMvrRate: true,
          telegramEnabled: true,
          telegramBotToken: true,
          telegramChatId: true,
        },
      },
    },
  });

  if (dueItems.length === 0) {
    return { processedCount: 0, transactions: [] };
  }

  const processedTransactions = [];

  for (const item of dueItems) {
    try {
      // Check if end date passed
      if (item.endDate && item.nextOccurrence > item.endDate) {
        await prisma.recurringTransaction.update({
          where: { id: item.id },
          data: { isActive: false },
        });
        continue;
      }

      const nextDate = advanceNextOccurrence(item.nextOccurrence, item.frequency);
      const willDeactivate = item.endDate ? nextDate > item.endDate : false;
      const currency = item.currency || item.account?.currency || 'MVR';
      const exchangeRateUsed = item.user?.usdToMvrRate || 15.42;

      const result = await prisma.$transaction(async (tx) => {
        // 1. Update account balance
        if (item.type === 'INCOME') {
          await tx.account.update({
            where: { id: item.accountId },
            data: { balance: { increment: item.amount } },
          });
        } else {
          await tx.account.update({
            where: { id: item.accountId },
            data: { balance: { decrement: item.amount } },
          });
        }

        // 2. Create actual transaction record
        const createdTx = await tx.transaction.create({
          data: {
            userId: item.userId,
            accountId: item.accountId,
            categoryId: item.categoryId || null,
            type: item.type,
            amount: item.amount,
            currency,
            exchangeRateUsed,
            payee: item.payee,
            description:
              item.description ||
              `Automated ${item.frequency.toLowerCase()} payment: ${item.payee}`,
            date: item.nextOccurrence,
            isRecurring: true,
            recurringId: item.id,
          },
          include: {
            account: true,
            category: true,
          },
        });

        // 3. Advance next occurrence
        await tx.recurringTransaction.update({
          where: { id: item.id },
          data: {
            nextOccurrence: nextDate,
            isActive: !willDeactivate,
          },
        });

        // 4. Create in-app notification
        await tx.notification.create({
          data: {
            userId: item.userId,
            title: `Recurring ${item.type === 'INCOME' ? 'Income' : 'Payment'} Auto-Executed`,
            message: `Scheduled ${item.frequency.toLowerCase()} ${item.type.toLowerCase()} "${item.payee}" of ${currency} ${item.amount.toFixed(2)} was logged to ${item.account.name}.`,
            type: 'SYSTEM',
            severity: 'SUCCESS',
            actionUrl: '/transactions',
          },
        });

        return createdTx;
      });

      processedTransactions.push(result);

      // 5. Send Telegram notification if enabled
      if (item.user?.telegramEnabled && (item.user.telegramChatId || process.env.TELEGRAM_CHAT_ID)) {
        const textMessage = `🔄 *Auto Recurring ${item.type === 'INCOME' ? 'Income' : 'Expense'} Executed*\n\n` +
          `• Payee: *${item.payee}*\n` +
          `• Amount: *${currency} ${item.amount.toFixed(2)}*\n` +
          `• Account: *${item.account.name}*\n` +
          `• Frequency: *${item.frequency}*\n` +
          `• Next Occurrence: *${nextDate.toISOString().split('T')[0]}*`;

        sendTelegramNotification(
          item.user,
          'Recurring Transaction Processed',
          textMessage
        ).catch((err) => {
          console.error('[RecurringEngine] Telegram alert error:', err.message);
        });
      }
    } catch (itemErr) {
      console.error(`[RecurringEngine] Error processing recurring tx ${item.id}:`, itemErr);
    }
  }

  return {
    processedCount: processedTransactions.length,
    transactions: processedTransactions,
  };
}

/**
 * Process due recurring transactions across all users.
 */
export async function processAllDueRecurring() {
  const now = new Date();
  const usersWithDue = await prisma.recurringTransaction.findMany({
    where: {
      isActive: true,
      nextOccurrence: { lte: now },
    },
    select: { userId: true },
    distinct: ['userId'],
  });

  let totalProcessed = 0;
  for (const { userId } of usersWithDue) {
    try {
      const res = await processDueRecurringForUser(userId);
      totalProcessed += res.processedCount;
    } catch (err) {
      console.error(`[RecurringEngine] Error for user ${userId}:`, err);
    }
  }

  return totalProcessed;
}
