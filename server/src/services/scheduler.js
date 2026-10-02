import prisma from '../prisma/client.js';
import { processAllDueRecurring } from './recurringEngine.js';
import { sendDailyBriefing, checkAndSendBillReminders } from './briefingService.js';

let schedulerInterval = null;

/**
 * Run scheduler job checks:
 * 1. Process due recurring transactions.
 * 2. Dispatch bill due reminders for upcoming bills.
 * 3. Send morning briefing if it's ~08:00 AM and not yet sent today.
 */
export async function runScheduledTasks() {
  const now = new Date();
  const currentHour = now.getHours();

  try {
    // 1. Process due recurring transactions across all users
    const recurringProcessed = await processAllDueRecurring();
    if (recurringProcessed > 0) {
      console.log(`[Scheduler] 🔄 Automatically processed ${recurringProcessed} recurring transaction(s).`);
    }
  } catch (err) {
    console.error('[Scheduler] Error processing recurring transactions:', err.message);
  }

  try {
    // 2. Check upcoming bill reminders for all active users
    const users = await prisma.user.findMany({
      where: { notifyBillReminders: true },
      select: { id: true, email: true, telegramEnabled: true },
    });

    for (const u of users) {
      try {
        await checkAndSendBillReminders(u.id);
      } catch (billErr) {
        console.error(`[Scheduler] Error checking bills for user ${u.id}:`, billErr.message);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error checking bill reminders:', err.message);
  }

  // 3. Daily Morning Briefing (Triggered in morning hours: 8:00 AM - 9:00 AM)
  if (currentHour >= 8 && currentHour < 10) {
    try {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

      const telegramUsers = await prisma.user.findMany({
        where: {
          telegramEnabled: true,
          OR: [
            { telegramChatId: { not: null } },
            { email: 'alex@faisaa.io' },
            { email: 'alex@finora.io' },
          ],
        },
        select: { id: true },
      });

      for (const { id: userId } of telegramUsers) {
        try {
          // Check if briefing was already delivered today
          const alreadySent = await prisma.notification.findFirst({
            where: {
              userId,
              title: '🌅 Your Daily Financial Briefing',
              createdAt: { gte: todayStart },
            },
          });

          if (!alreadySent) {
            await sendDailyBriefing(userId);
            console.log(`[Scheduler] 🌅 Sent daily briefing to user ${userId}`);
          }
        } catch (briefingErr) {
          console.error(`[Scheduler] Error sending briefing to user ${userId}:`, briefingErr.message);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Error running daily briefing cycle:', err.message);
    }
  }
}

/**
 * Start the background scheduler timer.
 * Runs initially after 10 seconds, then repeats every 15 minutes.
 */
export function startScheduler() {
  if (schedulerInterval) return;

  console.log('⏰ Faisaa Automated Scheduler initialized (Recurring Transactions + Bill Reminders + Daily Briefing).');

  // Initial run after short delay on server boot
  setTimeout(() => {
    runScheduledTasks().catch((err) => {
      console.error('[Scheduler] Initial run error:', err);
    });
  }, 10000);

  // Repeat every 15 minutes
  const INTERVAL_MS = 15 * 60 * 1000;
  schedulerInterval = setInterval(() => {
    runScheduledTasks().catch((err) => {
      console.error('[Scheduler] Cycle error:', err);
    });
  }, INTERVAL_MS);
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
