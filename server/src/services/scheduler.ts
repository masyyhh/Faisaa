import prisma from '../prisma/client.js';
import { processAllDueRecurring } from './recurringEngine.js';
import { sendDailyBriefing, checkAndSendBillReminders } from './briefingService.js';

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Run scheduler job checks:
 * 1. Process due recurring transactions.
 * 2. Dispatch bill due reminders for upcoming bills.
 * 3. Send morning briefing if it's ~08:00 AM and not yet sent today.
 */
export async function runScheduledTasks(): Promise<void> {
  const now = new Date();
  const currentHour = now.getHours();

  try {
    // 1. Process due recurring transactions across all users
    const recurringProcessed = await processAllDueRecurring();
    if (recurringProcessed > 0) {
      console.log(`[Scheduler] 🔄 Automatically processed ${recurringProcessed} recurring transaction(s).`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Scheduler] Error processing recurring transactions:', msg);
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
      } catch (billErr: unknown) {
        const msg = billErr instanceof Error ? billErr.message : String(billErr);
        console.error(`[Scheduler] Error checking bills for user ${u.id}:`, msg);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Scheduler] Error checking bill reminders:', msg);
  }

  // 3. User-Scheduled Daily Financial Briefing
  try {
    const candidateUsers = await prisma.user.findMany({
      where: {
        dailyBriefingEnabled: true,
      },
      select: {
        id: true,
        email: true,
        telegramEnabled: true,
        telegramChatId: true,
        dailyBriefingTime: true,
        timezone: true,
      },
    });

    for (const u of candidateUsers) {
      const userTz = u.timezone || 'Indian/Maldives';
      let userHours = now.getHours();
      let userMinutes = now.getMinutes();

      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: userTz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        const parts = formatter.formatToParts(now);
        const hPart = parts.find((p) => p.type === 'hour')?.value;
        const mPart = parts.find((p) => p.type === 'minute')?.value;
        if (hPart) userHours = parseInt(hPart, 10);
        if (mPart) userMinutes = parseInt(mPart, 10);
      } catch {
        // Fallback to local system time if user's timezone string is invalid
        userHours = now.getHours();
        userMinutes = now.getMinutes();
      }

      const [targetHStr, targetMStr] = (u.dailyBriefingTime || '08:00').split(':');
      const targetHours = parseInt(targetHStr, 10) || 8;
      const targetMinutes = parseInt(targetMStr, 10) || 0;

      const targetTotalMins = targetHours * 60 + targetMinutes;
      const currentTotalMins = userHours * 60 + userMinutes;

      // Deliver if current time is at or within 90 minutes after target time
      if (currentTotalMins >= targetTotalMins && currentTotalMins < targetTotalMins + 90) {
        // Check if briefing was already dispatched within the last 18 hours
        const eighteenHoursAgo = new Date(Date.now() - 18 * 60 * 60 * 1000);
        const alreadySent = await prisma.notification.findFirst({
          where: {
            userId: u.id,
            title: '🌅 Your Daily Financial Briefing',
            createdAt: { gte: eighteenHoursAgo },
          },
          select: { id: true },
        });

        if (!alreadySent) {
          try {
            await sendDailyBriefing(u.id);
            console.log(`[Scheduler] 🌅 Sent personalized daily briefing to user ${u.email || u.id} at ${u.dailyBriefingTime} (${userTz})`);
          } catch (briefingErr: unknown) {
            const msg = briefingErr instanceof Error ? briefingErr.message : String(briefingErr);
            console.error(`[Scheduler] Error sending briefing to user ${u.id}:`, msg);
          }
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Scheduler] Error running daily briefing cycle:', msg);
  }
}

/**
 * Start the background scheduler timer.
 * Runs initially after 10 seconds, then repeats every 15 minutes.
 */
export function startScheduler(): void {
  if (schedulerInterval) return;

  console.log('⏰ Faisaa Automated Scheduler initialized (Recurring Transactions + Bill Reminders + Daily Briefing).');

  // Initial run after short delay on server boot
  setTimeout(() => {
    runScheduledTasks().catch((err: unknown) => {
      console.error('[Scheduler] Initial run error:', err);
    });
  }, 10000);

  // Repeat every 15 minutes
  const INTERVAL_MS = 15 * 60 * 1000;
  schedulerInterval = setInterval(() => {
    runScheduledTasks().catch((err: unknown) => {
      console.error('[Scheduler] Cycle error:', err);
    });
  }, INTERVAL_MS);
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
