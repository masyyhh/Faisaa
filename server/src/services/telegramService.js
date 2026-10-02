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

    const isDemoUser = Boolean(
      user && (user.email === 'alex@faisaa.io' || user.email === 'alex@finora.io')
    );

    const botToken = (
      overrideCreds.botToken?.trim() ||
      user?.telegramBotToken?.trim() ||
      (isDemoUser ? process.env.TELEGRAM_BOT_TOKEN?.trim() : '') ||
      process.env.TELEGRAM_BOT_TOKEN?.trim() ||
      ''
    );
    const chatId = (
      overrideCreds.chatId?.trim() ||
      user?.telegramChatId?.trim() ||
      (isDemoUser ? process.env.TELEGRAM_CHAT_ID?.trim() : '') ||
      process.env.TELEGRAM_CHAT_ID?.trim() ||
      ''
    );

    if (!botToken || !chatId) {
      return { sent: false, reason: 'Missing Telegram Bot Token or Chat ID' };
    }

    if (!BOT_TOKEN_REGEX.test(botToken) || !CHAT_ID_REGEX.test(chatId)) {
      return { sent: false, reason: 'Invalid Telegram Bot Token or Chat ID format' };
    }

    const cleanMessage = escapeMarkdown(message);
    const text = `*Faisaa Online Alert*\n*${escapeMarkdown(title)}*\n\n${cleanMessage}\n\n_Base: MVR • Rate: 1 USD = MVR ${Number(user?.usdToMvrRate || 18.45).toFixed(2)}_`;

    return await sendTelegramMessageRaw(botToken, chatId, text);
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

/**
 * Send raw markdown text directly to any Telegram chat ID using a bot token.
 */
export async function sendTelegramMessageRaw(botToken, chatId, text) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });

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

/**
 * Configure Telegram Bot Webhook URL with Telegram's API
 */
export async function setTelegramWebhook(botToken, webhookUrl, secretToken = null) {
  try {
    const bodyPayload = {
      url: webhookUrl,
      allowed_updates: ['message'],
    };
    if (secretToken) {
      bodyPayload.secret_token = secretToken;
    }
    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify(bodyPayload),
    });
    return await response.json();
  } catch (err) {
    return { ok: false, description: err.message };
  }
}

/**
 * Check Bot info from Telegram API
 */
export async function getTelegramBotInfo(botToken) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
      signal: AbortSignal.timeout(5000),
    });
    return await response.json();
  } catch (err) {
    return { ok: false, description: err.message };
  }
}

function escapeMarkdown(str = '') {
  return String(str).replace(/[_*[\]`]/g, '');
}
