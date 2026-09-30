import prisma from '../prisma/client.js';

const BOT_TOKEN_REGEX = /^\d+:[A-Za-z0-9_-]{20,70}$/;
const CHAT_ID_REGEX = /^-?\d{4,25}$/;

export async function sendTelegramNotification(userOrUserId, title, message, overrideCreds = {}) {
  try {
    let user = userOrUserId;
    if (typeof userOrUserId === 'string') {
      user = await prisma.user.findUnique({ where: { id: userOrUserId } });
    }

    if (user && user.telegramEnabled === false && !overrideCreds.force) {
      return { sent: false, reason: 'Telegram notifications disabled by user' };
    }

    const isDemoUser = user?.email === 'alex@finora.io';
    const botToken = (
      overrideCreds.botToken?.trim() ||
      user?.telegramBotToken?.trim() ||
      (isDemoUser ? process.env.TELEGRAM_BOT_TOKEN?.trim() : '') ||
      ''
    );
    const chatId = (
      overrideCreds.chatId?.trim() ||
      user?.telegramChatId?.trim() ||
      (isDemoUser ? process.env.TELEGRAM_CHAT_ID?.trim() : '') ||
      ''
    );

    if (!botToken || !chatId) {
      return { sent: false, reason: 'Missing Telegram Bot Token or Chat ID' };
    }

    if (!BOT_TOKEN_REGEX.test(botToken) || !CHAT_ID_REGEX.test(chatId)) {
      return { sent: false, reason: 'Invalid Telegram Bot Token or Chat ID format' };
    }

    const text = `*Finora Wealth Alert*\n*${escapeMarkdown(title)}*\n\n${escapeMarkdown(message)}\n\n_Base: MVR • Rate: 1 USD = MVR ${Number(user?.usdToMvrRate || 15.42).toFixed(2)}_`;

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        }),
      }
    );

    const data = await response.json();
    if (!response.ok || !data.ok) {
      return {
        sent: false,
        reason: data.description || `Telegram HTTP ${response.status}`,
      };
    }

    return { sent: true, messageId: data.result?.message_id };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

function escapeMarkdown(str = '') {
  return String(str).replace(/[_*[\]`]/g, '');
}
