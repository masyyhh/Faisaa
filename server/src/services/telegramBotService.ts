import type { Account, Category, User, Transaction } from '@prisma/client';
import prisma from '../prisma/client.js';
import { sendTelegramMessageRaw } from './telegramService.js';
import { getBriefingData, formatBriefingMarkdown } from './briefingService.js';
import { decrypt } from '../utils/crypto.js';

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Food & Dining': [
    'coffee', 'tea', 'cafe', 'restaurant', 'lunch', 'dinner', 'breakfast',
    'pizza', 'burger', 'sub', 'kfc', 'bakery', 'takeaway', 'dine', 'short eats', 'hedhika',
  ],
  'Groceries': [
    'groceries', 'grocery', 'supermart', 'redwave', 'agora', 'ihsaan', 'fantasy',
    'shoppers', 'market', 'vegetables', 'fruits', 'foodstore',
  ],
  'Transportation': [
    'petrol', 'fuel', 'gas', 'taxi', 'ferry', 'bus', 'flight', 'airline',
    'speed boat', 'speedboat', 'rtl', 'toll', 'parking', 'bike',
  ],
  'Bills & Utilities': [
    'dhiraagu', 'ooredoo', 'stelco', 'mwsc', 'medianet', 'internet', 'broadband',
    'electricity', 'water', 'utility', 'bill', 'cable', 'recharge', 'phone',
  ],
  'Healthcare': [
    'pharmacy', 'sto', 'adk', 'treetop', 'medica', 'hospital', 'clinic',
    'doctor', 'medicine', 'dental', 'consultation',
  ],
  'Entertainment': [
    'netflix', 'spotify', 'movie', 'cinema', 'schwack', 'games', 'game',
    'steam', 'playstation', 'subscription', 'youtube',
  ],
  'Shopping': [
    'clothes', 'shoes', 'dress', 'perfume', 'cosmetics', 'electronics',
    'amazon', 'shein', 'aliexpress', 'gadget',
  ],
  'Income': [
    'salary', 'bonus', 'dividend', 'interest', 'freelance', 'client',
    'payroll', 'pension', 'allowance', 'stipend',
  ],
};

function capitalizeWords(str: string = ''): string {
  return str
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export interface ParsedExpense {
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  currency: string;
  payee: string;
  description: string;
  accountId?: string;
  targetAccount?: Account | null;
  categoryId?: string | null;
}

/**
 * Natural language parser for expense/income messages sent via Telegram.
 */
export function parseExpenseText(
  text: string = '',
  accounts: Account[] = [],
  categories: Category[] = [],
  pastPayeeMap?: Record<string, string>
): ParsedExpense | null {
  const clean = text.trim();
  if (!clean) return null;

  // Detect income indicator (+ or words like income, salary)
  const isIncome = clean.startsWith('+') || /^\b(income|salary|deposit|received)\b/i.test(clean);
  const type: 'INCOME' | 'EXPENSE' = isIncome ? 'INCOME' : 'EXPENSE';

  // Strip leading plus or command words
  const normalized = clean.replace(/^[+/]\s*/, '').replace(/^\b(spend|expense|paid|bought|income|received)\s+/i, '');

  // Regex to extract amount (first integer or float, e.g., 50, 45.50, $25, 250)
  const amountMatch = normalized.match(/(\$)?\s*([0-9]+(?:\.[0-9]{1,2})?)\s*(\$|mvr|usd|rf)?/i);
  if (!amountMatch) return null;

  const rawAmount = parseFloat(amountMatch[2]);
  if (isNaN(rawAmount) || rawAmount <= 0) return null;

  // Currency detection
  const curIndicator = (amountMatch[1] || amountMatch[3] || '').toLowerCase();
  const hasUsdKeyword = /\b(usd|\$|dollars?)\b/i.test(normalized);
  const currency = curIndicator === '$' || curIndicator === 'usd' || hasUsdKeyword ? 'USD' : 'MVR';

  // Remainder text is payee / description
  let remainder = normalized.replace(amountMatch[0], '').replace(/\b(usd|\$|mvr|rf|dollars?)\b/gi, '').trim();

  // Try matching an account keyword in remainder
  let targetAccount: Account | null = null;
  const words = remainder.split(/\s+/);
  for (const word of words) {
    const matchedAcc = accounts.find((a) =>
      a.name.toLowerCase().includes(word.toLowerCase()) ||
      (word.toLowerCase() === 'bml' && /bml|bank/i.test(a.name)) ||
      (word.toLowerCase() === 'mib' && /mib/i.test(a.name)) ||
      (word.toLowerCase() === 'cash' && /cash|wallet/i.test(a.name))
    );
    if (matchedAcc) {
      targetAccount = matchedAcc;
      remainder = remainder.replace(new RegExp(`\\b${word}\\b`, 'i'), '').trim();
      break;
    }
  }

  // Fallback to default account (matching currency first, then any default), or active currency-matching account
  if (!targetAccount) {
    targetAccount =
      accounts.find((a) => a.isDefault && a.currency === currency && a.isActive) ||
      accounts.find((a) => a.isDefault && a.isActive) ||
      accounts.find((a) => a.currency === currency && a.isActive) ||
      accounts.find((a) => a.isActive) ||
      accounts[0] ||
      null;
  }

  // Determine Category based on keywords
  const payeeDescription = remainder || (type === 'INCOME' ? 'Income' : 'Miscellaneous Expense');
  const lowerText = normalized.toLowerCase();
  let matchedCategoryId: string | null = null;

  // 1. Check user's past payee associations
  if (pastPayeeMap && remainder) {
    const cleanRemainder = remainder.toLowerCase().trim();
    if (pastPayeeMap[cleanRemainder]) {
      matchedCategoryId = pastPayeeMap[cleanRemainder];
    } else {
      for (const [p, cId] of Object.entries(pastPayeeMap)) {
        if (cleanRemainder.includes(p) || p.includes(cleanRemainder)) {
          matchedCategoryId = cId;
          break;
        }
      }
    }
  }

  // 2. Keyword heuristics
  if (!matchedCategoryId) {
    for (const [catName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some((kw) => lowerText.includes(kw))) {
        const foundCat = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase());
        if (foundCat) {
          matchedCategoryId = foundCat.id;
          break;
        }
      }
    }
  }

  // Fallback to general category matching transaction type
  if (!matchedCategoryId) {
    const fallback = categories.find((c) => c.type === type);
    if (fallback) matchedCategoryId = fallback.id;
  }

  return {
    type,
    amount: rawAmount,
    currency,
    payee: capitalizeWords(payeeDescription),
    description: `Logged via Faisaa Telegram Bot: "${clean}"`,
    accountId: targetAccount?.id,
    targetAccount,
    categoryId: matchedCategoryId,
  };
}

export interface WebhookUpdateResult {
  handled: boolean;
  reason?: string;
  error?: string;
  transaction?: Transaction;
}

/**
 * Handle incoming Telegram webhook updates.
 */
export async function handleTelegramWebhookUpdate(
  update: any,
  defaultBotToken: string | null = null,
  userOverride: any = null
): Promise<WebhookUpdateResult> {
  const message = update?.message || update?.edited_message;
  if (!message || !message.text) return { handled: false, reason: 'No message text' };

  const chatId = String(message.chat?.id || 'simulation');
  const text: string = message.text.trim();
  console.log(`[TelegramBot] Incoming message from chatId=${chatId}: "${text}"`);

  // Helper to resolve an active decrypted bot token
  const resolveBotToken = async (potentialUser?: any): Promise<string | null> => {
    const raw =
      potentialUser?.telegramBotToken ||
      defaultBotToken ||
      process.env.TELEGRAM_BOT_TOKEN;

    if (raw) {
      const dec = decrypt(raw);
      if (dec) return dec;
    }

    // Fallback: check if any user in DB has a configured bot token
    const anyUser = await prisma.user.findFirst({
      where: { telegramBotToken: { not: null } },
      select: { telegramBotToken: true },
    });
    if (anyUser?.telegramBotToken) {
      const dec = decrypt(anyUser.telegramBotToken);
      if (dec) return dec;
    }

    return null;
  };

  // 1. Handle Account Linking (/link <code>) FIRST
  if (text.startsWith('/link')) {
    const parts = text.split(/\s+/);
    const code = parts[1]?.trim();

    let targetUser = null;
    const now = new Date();

    if (code && !code.includes('@') && !isNaN(Number(code))) {
      targetUser = await prisma.user.findFirst({
        where: {
          telegramLinkingCode: code,
          telegramLinkingExpires: { gte: now },
        },
        include: {
          accounts: { where: { isActive: true } },
          categories: true,
        },
      });
    }

    const botToken = await resolveBotToken(targetUser || userOverride);

    const safeSend = async (chatIdToSend: string, textToSend: string) => {
      if (botToken && chatIdToSend !== 'simulation') {
        const res = await sendTelegramMessageRaw(botToken, chatIdToSend, textToSend);
        if (!res.sent) {
          console.warn(`[TelegramBot] Failed sending message to ${chatIdToSend}:`, res.reason);
        }
        return res;
      }
      return { sent: true, simulated: true };
    };

    if (!code) {
      await safeSend(
        chatId,
        `⚠️ *Secure Account Linking:*\n` +
        `To link your Faisaa account, generate a 6-digit linking code from *Settings → Notifications & Telegram* on the web, then send:\n\n` +
        `\`/link 123456\``
      );
      return { handled: true };
    }

    // Security defense: Reject attempts to link via email or username
    if (code.includes('@') || isNaN(Number(code))) {
      await safeSend(
        chatId,
        `🔒 *Security Notice:*\n` +
        `Account linking by username or email is disabled to protect your financial data.\n\n` +
        `To connect securely:\n` +
        `1. Open Faisaa in your browser\n` +
        `2. Go to *Settings → Notifications & Telegram*\n` +
        `3. Click *Generate Linking Code*\n` +
        `4. Send \`/link <code>\` here within 15 minutes.`
      );
      return { handled: true };
    }

    if (!targetUser) {
      console.warn(`[TelegramBot] Invalid or expired linking code: "${code}" from chatId=${chatId}`);
      await safeSend(
        chatId,
        `❌ Invalid or expired linking code.\n\nPlease generate a fresh 6-digit code in *Settings → Notifications & Telegram* on the web and try again.`
      );
      return { handled: true };
    }

    // Disassociate this chatId from any existing users to prevent duplicate routing
    await prisma.user.updateMany({
      where: {
        telegramChatId: chatId,
        id: { not: targetUser.id },
      },
      data: { telegramChatId: null },
    });

    // Link Telegram Chat ID and invalidate the one-time code
    await prisma.user.update({
      where: { id: targetUser.id },
      data: {
        telegramChatId: chatId,
        telegramEnabled: true,
        telegramLinkingCode: null,
        telegramLinkingExpires: null,
      },
    });

    console.log(`[TelegramBot] Successfully linked chatId=${chatId} to user ${targetUser.email} (${targetUser.id})`);

    await safeSend(
      chatId,
      `🎉 *Account Connected!*\n\nWelcome, *${targetUser.firstName}*! Your Telegram account is now securely linked to Faisaa.\n\n` +
      `💡 *Try these quick commands:*\n` +
      `• \`50 coffee\` — log a MVR 50 expense\n` +
      `• \`120 lunch bml\` — log with BML account\n` +
      `• \`25 dinner usd\` — log USD transaction\n` +
      `• \`+5000 salary\` — log income\n` +
      `• \`/balance\` — view account balances\n` +
      `• \`/today\` — today's spend summary\n` +
      `• \`/briefing\` — full daily financial digest`
    );
    return { handled: true };
  }

  // 2. Find authenticated user by Telegram Chat ID or use userOverride
  let user: any = userOverride;
  if (!user) {
    user = await prisma.user.findFirst({
      where: { telegramChatId: chatId },
      include: {
        accounts: { where: { isActive: true } },
        categories: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  } else if (!user.accounts || !user.categories) {
    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        accounts: { where: { isActive: true } },
        categories: true,
      },
    });
    if (fresh) user = fresh;
  }

  const botToken = await resolveBotToken(user);

  const safeSend = async (chatIdToSend: string, textToSend: string) => {
    if (botToken && chatIdToSend !== 'simulation') {
      const res = await sendTelegramMessageRaw(botToken, chatIdToSend, textToSend);
      if (!res.sent) {
        console.warn(`[TelegramBot] Failed sending message to ${chatIdToSend}:`, res.reason);
      }
      return res;
    }
    return { sent: true, simulated: true };
  };

  if (!botToken && !userOverride) {
    console.warn(`[TelegramBot] Missing bot token to reply to chatId=${chatId}`);
    return { handled: false, reason: 'Missing bot token to reply' };
  }

  // 3. If user is still not linked:
  if (!user) {
    console.warn(`[TelegramBot] Unlinked command from chatId=${chatId}: "${text}"`);
    await safeSend(chatId,
      `👋 *Welcome to Faisaa Expense Bot!*\n\n` +
      `Your Telegram Chat ID is: \`${chatId}\`\n\n` +
      `To start tracking expenses directly from Telegram, link your account by generating a 6-digit code in Faisaa *Settings → Notifications & Telegram*, then send:\n\n` +
      `\`/link <6-digit-code>\`\n\n` +
      `_Example:_ \`/link 482915\``
    );
    return { handled: true };
  }

  // 4. Handle Standard Commands for Authenticated Users
  const lowerCmd = text.toLowerCase();

  if (lowerCmd === '/start' || lowerCmd === '/help') {
    const helpMsg =
      `👋 *Hello, ${user.firstName}!* Welcome to your *Faisaa Expense Assistant*.\n\n` +
      `📝 *Quick Expense Logging:* Just type naturally!\n` +
      `• \`50 coffee\` → logs MVR 50.00 Food & Dining\n` +
      `• \`150 lunch bml\` → logs MVR 150.00 from BML\n` +
      `• \`30 books usd\` → logs $30.00 USD\n` +
      `• \`+8500 freelance\` → logs MVR 8,500 Income\n\n` +
      `⚡ *Commands:*\n` +
      `• \`/balance\` or \`/bal\` — Check account balances\n` +
      `• \`/today\` — Today's transactions & spending\n` +
      `• \`/briefing\` — Full morning financial report\n` +
      `• \`/bills\` — Upcoming unpaid bills\n` +
      `• \`/help\` — View this guide`;
    await safeSend(chatId, helpMsg);
    return { handled: true };
  }

  if (lowerCmd === '/balance' || lowerCmd === '/bal' || lowerCmd === '/balances') {
    let msg = `💰 *Your Faisaa Balances:*\n\n`;
    let mvrTotal = 0;
    let usdTotal = 0;

    for (const acc of user.accounts) {
      const formatted = `${acc.currency} ${acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      msg += `• *${acc.name}*: \`${formatted}\`\n`;
      if (acc.currency === 'USD') usdTotal += acc.balance;
      else mvrTotal += acc.balance;
    }

    const rate = user.usdToMvrRate || 18.45;
    const netMvr = mvrTotal + usdTotal * rate;

    msg += `\n*Total Liquid:* MVR ${netMvr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    msg += ` _(USD/MVR Rate: ${rate.toFixed(2)})_`;

    await safeSend(chatId, msg);
    return { handled: true };
  }

  if (lowerCmd === '/today') {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    const todayTx = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        date: { gte: startOfToday },
      },
      include: { account: true, category: true },
      orderBy: { date: 'desc' },
    });

    if (todayTx.length === 0) {
      await safeSend(
        chatId,
        `📊 *Today's Activity:*\n\nNo transactions recorded yet today. Type e.g. \`45 lunch\` to log one!`
      );
      return { handled: true };
    }

    let totalExpenseMvr = 0;
    let msg = `📊 *Today's Transactions (${todayTx.length}):*\n\n`;

    for (const tx of todayTx) {
      const sign = tx.type === 'INCOME' ? '+' : '-';
      msg += `• ${sign}*${tx.currency} ${tx.amount.toFixed(2)}* — ${tx.payee} _(${tx.category?.name || tx.account.name})_\n`;
      if (tx.type === 'EXPENSE') {
        const amtMvr = tx.currency === 'USD' ? tx.amount * (user.usdToMvrRate || 18.45) : tx.amount;
        totalExpenseMvr += amtMvr;
      }
    }

    msg += `\n*Total Spent Today:* MVR ${totalExpenseMvr.toFixed(2)}`;
    await safeSend(chatId, msg);
    return { handled: true };
  }

  if (lowerCmd === '/briefing') {
    const briefingData = await getBriefingData(user.id);
    if (!briefingData) {
      await safeSend(chatId, 'Unable to load briefing data.');
      return { handled: true };
    }
    const briefingText = formatBriefingMarkdown(briefingData);
    await safeSend(chatId, briefingText);
    return { handled: true };
  }

  if (lowerCmd === '/bills') {
    const bills = await prisma.bill.findMany({
      where: {
        userId: user.id,
        status: { in: ['UPCOMING', 'OVERDUE'] },
      },
      orderBy: { dueDate: 'asc' },
      take: 10,
    });

    if (bills.length === 0) {
      await safeSend(
        chatId,
        `✅ *All clear!* You have no unpaid upcoming bills at the moment.`
      );
      return { handled: true };
    }

    let msg = `🧾 *Upcoming Bills (${bills.length}):*\n\n`;
    for (const b of bills) {
      const dateStr = new Date(b.dueDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      msg += `• *${b.name}* — MVR ${b.amount.toFixed(2)} (Due: ${dateStr})\n`;
    }
    await safeSend(chatId, msg);
    return { handled: true };
  }

  // 5. Natural Expense / Income Parsing with historical memory
  const recentTxs = await prisma.transaction.findMany({
    where: { userId: user.id, categoryId: { not: null } },
    orderBy: { date: 'desc' },
    take: 60,
    select: { payee: true, categoryId: true },
  });
  const pastPayeeMap: Record<string, string> = {};
  for (const t of recentTxs) {
    if (t.payee && t.categoryId) {
      pastPayeeMap[t.payee.toLowerCase().trim()] = t.categoryId;
    }
  }

  const parsed = parseExpenseText(text, user.accounts, user.categories, pastPayeeMap);
  if (!parsed || !parsed.targetAccount) {
    await safeSend(chatId,
      `❓ Could not understand "${text}".\n\nTry typing: \`50 coffee\` or \`120 lunch bml\` or type \`/help\` for examples.`
    );
    return { handled: true };
  }

  try {
    const createdTx = await prisma.$transaction(async (tx) => {
      // 1. Update account balance
      if (parsed.type === 'INCOME') {
        await tx.account.update({
          where: { id: parsed.accountId },
          data: { balance: { increment: parsed.amount } },
        });
      } else {
        await tx.account.update({
          where: { id: parsed.accountId },
          data: { balance: { decrement: parsed.amount } },
        });
      }

      // 2. Create Transaction
      return await tx.transaction.create({
        data: {
          userId: user.id,
          accountId: parsed.accountId!,
          categoryId: parsed.categoryId,
          type: parsed.type,
          amount: parsed.amount,
          currency: parsed.currency,
          exchangeRateUsed: user.usdToMvrRate || 18.45,
          payee: parsed.payee,
          description: parsed.description,
          date: new Date(),
        },
        include: { account: true, category: true },
      });
    });

    const isInc = createdTx.type === 'INCOME';
    const catName = createdTx.category?.name || 'General';
    const newBal = createdTx.account.balance;

    const receiptMsg =
      `✅ *${isInc ? 'Income' : 'Expense'} Recorded!*\n\n` +
      `• *Amount:* ${isInc ? '+' : '-'}${createdTx.currency} ${createdTx.amount.toFixed(2)}\n` +
      `• *Payee:* ${createdTx.payee}\n` +
      `• *Category:* ${catName}\n` +
      `• *Account:* ${createdTx.account.name} (Balance: ${createdTx.account.currency} ${newBal.toLocaleString('en-US', { minimumFractionDigits: 2 })})\n` +
      `• *Date:* Today\n\n` +
      `_Logged instantly to Faisaa_ 🚀`;

    await safeSend(chatId, receiptMsg);

    // Also add in-app notification
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: `Telegram Entry: ${createdTx.payee}`,
        message: `${createdTx.currency} ${createdTx.amount.toFixed(2)} recorded via Telegram to ${createdTx.account.name}.`,
        type: 'SYSTEM',
        severity: 'SUCCESS',
        actionUrl: '/transactions',
      },
    });

    return { handled: true, transaction: createdTx };
  } catch (txErr: unknown) {
    const msg = txErr instanceof Error ? txErr.message : String(txErr);
    console.error('[TelegramBot] Error saving parsed transaction:', txErr);
    await safeSend(chatId,
      `⚠️ Error saving transaction: ${msg}`
    );
    return { handled: false, error: msg };
  }
}
