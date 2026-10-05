import type { User } from '@prisma/client';
import type { AuthUser } from '../middleware/auth.js';
import prisma from '../prisma/client.js';
import { decrypt } from '../utils/crypto.js';

const BOT_TOKEN_REGEX = /^\d+:[A-Za-z0-9_-]{20,70}$/;
const CHAT_ID_REGEX = /^-?\d{4,25}$/;

export interface TelegramOverrideCreds {
  force?: boolean;
  botToken?: string;
  chatId?: string;
}

export interface TelegramSendResult {
  sent: boolean;
  reason?: string;
  messageId?: number;
  simulated?: boolean;
}

export interface TelegramApiResponse {
  ok: boolean;
  result?: any;
  description?: string;
}

export async function sendTelegramNotification(
  userOrUserId: User | AuthUser | string,
  title: string,
  message: string,
  overrideCreds: TelegramOverrideCreds = {}
): Promise<TelegramSendResult> {
  try {
    let user: User | AuthUser | null = null;
    if (typeof userOrUserId === 'string') {
      user = await prisma.user.findUnique({ where: { id: userOrUserId } });
    } else {
      user = userOrUserId;
    }

    if (user && user.telegramEnabled === false && !overrideCreds.force) {
      return { sent: false, reason: 'Telegram notifications disabled by user' };
    }

    const isDemoUser = Boolean(
      user && (user.email === 'alex@faisaa.online' || user.email === 'alex@faisaa.io' || user.email === 'alex@finora.io')
    );

    const decryptedUserToken = user?.telegramBotToken ? decrypt(user.telegramBotToken) : '';
    const decryptedOverrideToken = overrideCreds.botToken ? decrypt(overrideCreds.botToken) : '';

    const botToken = (
      decryptedOverrideToken?.trim() ||
      decryptedUserToken?.trim() ||
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
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { sent: false, reason: errorMsg };
  }
}

/**
 * Send raw markdown text directly to any Telegram chat ID using a bot token.
 */
export async function sendTelegramMessageRaw(
  botToken: string,
  chatId: string,
  text: string
): Promise<TelegramSendResult> {
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

    const data = (await response.json()) as TelegramApiResponse;
    if (!response.ok || !data.ok) {
      // If Markdown parsing error, retry in plain text without parse_mode
      if (data.description && (data.description.includes("can't parse entities") || data.description.includes('Bad Request'))) {
        console.warn(`[TelegramService] Markdown parsing failed, retrying plain text:`, data.description);
        const retryRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            chat_id: chatId,
            text: text.replace(/[*_`]/g, ''),
          }),
        });
        const retryData = (await retryRes.json()) as TelegramApiResponse;
        if (retryRes.ok && retryData.ok) {
          return { sent: true, messageId: retryData.result?.message_id };
        }
      }
      return {
        sent: false,
        reason: data.description || `Telegram HTTP ${response.status}`,
      };
    }

    return { sent: true, messageId: data.result?.message_id };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { sent: false, reason: errorMsg };
  }
}

/**
 * Configure Telegram Bot Webhook URL with Telegram's API
 */
export async function setTelegramWebhook(
  botToken: string,
  webhookUrl: string,
  secretToken: string | null = null
): Promise<TelegramApiResponse> {
  try {
    const bodyPayload: Record<string, any> = {
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
    return (await response.json()) as TelegramApiResponse;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, description: errorMsg };
  }
}

/**
 * Check Bot info from Telegram API
 */
export async function getTelegramBotInfo(botToken: string): Promise<TelegramApiResponse> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
      signal: AbortSignal.timeout(5000),
    });
    return (await response.json()) as TelegramApiResponse;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, description: errorMsg };
  }
}

/**
 * Get Webhook info from Telegram API
 */
export async function getTelegramWebhookInfo(botToken: string): Promise<TelegramApiResponse> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`, {
      signal: AbortSignal.timeout(5000),
    });
    return (await response.json()) as TelegramApiResponse;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, description: errorMsg };
  }
}

function escapeMarkdown(str: string = ''): string {
  return String(str).replace(/[_*[\]`]/g, '');
}
