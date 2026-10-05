import type { Request, Response, NextFunction } from 'express';
import prisma from '../prisma/client.js';
import { handleTelegramWebhookUpdate } from '../services/telegramBotService.js';
import { setTelegramWebhook, getTelegramBotInfo, getTelegramWebhookInfo } from '../services/telegramService.js';
import { sendDailyBriefing } from '../services/briefingService.js';
import { generateSecureOtp, decrypt } from '../utils/crypto.js';

/**
 * Public Telegram Webhook Endpoint
 * POST /api/telegram/webhook
 */
export async function handleWebhook(req: Request, res: Response): Promise<void> {
  try {
    // If a webhook secret token is configured in environment, verify header
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (expectedSecret && secretHeader !== expectedSecret) {
      console.warn('[TelegramWebhook] Rejected unauthorized webhook call with invalid or missing secret token.');
      res.status(403).json({ error: 'Unauthorized webhook request' });
      return;
    }

    // Respond 200 OK immediately so Telegram does not retry
    res.status(200).json({ ok: true });

    // Process update asynchronously in background
    if (req.body) {
      console.log('[TelegramWebhook] Received update:', JSON.stringify(req.body));
      const result = await handleTelegramWebhookUpdate(req.body);
      console.log('[TelegramWebhook] Handled update result:', JSON.stringify(result));
    }
  } catch (err) {
    console.error('[TelegramWebhook] Error handling update:', err);
  }
}

/**
 * Generate Secure One-Time Telegram Account Linking Code
 * POST /api/telegram/generate-link-code
 */
export async function generateLinkingCode(req: Request, res: Response, next: NextFunction) {
  try {
    // Generate cryptographically secure random 6-digit code (CSPRNG)
    const code = generateSecureOtp(6);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        telegramLinkingCode: code,
        telegramLinkingExpires: expiresAt,
      },
    });

    res.json({
      success: true,
      code,
      expiresAt: expiresAt.toISOString(),
      expiresInMinutes: 15,
      message: `Send "/link ${code}" to your Faisaa Telegram Bot within 15 minutes.`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Configure Telegram Webhook URL with Telegram API
 * POST /api/telegram/setup-webhook
 */
export async function setupWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const { webhookUrl, botToken } = req.body;
    let rawToken = botToken?.trim();

    // If botToken was empty or the masked token with '•', fall back to stored token in DB or .env
    if (!rawToken || rawToken.includes('•')) {
      rawToken = req.user!.telegramBotToken?.trim() || process.env.TELEGRAM_BOT_TOKEN;
    }

    const token = decrypt(rawToken);

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'No Telegram Bot Token provided or found in user profile.',
      });
    }

    if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('https://')) {
      return res.status(400).json({
        success: false,
        message: 'A valid HTTPS Webhook URL is required by Telegram (e.g. https://your-domain.com/api/telegram/webhook).',
      });
    }

    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET || undefined;
    const result = await setTelegramWebhook(token, webhookUrl, secretToken);

    if (result.ok) {
      res.json({
        success: true,
        message: 'Telegram Webhook successfully registered with Telegram!',
        details: result,
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.description || 'Failed to set Telegram webhook.',
        details: result,
      });
    }
  } catch (err) {
    next(err);
  }
}

/**
 * Get Bot Status & Details
 * GET /api/telegram/status
 */
export async function getBotStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const rawToken = req.user!.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
    const token = decrypt(rawToken);
    if (!token) {
      return res.json({
        success: true,
        connected: false,
        message: 'No Bot Token configured.',
      });
    }

    const [botInfo, webhookInfo] = await Promise.all([
      getTelegramBotInfo(token),
      getTelegramWebhookInfo(token),
    ]);

    res.json({
      success: true,
      connected: botInfo.ok === true,
      bot: botInfo.result || null,
      webhook: webhookInfo.result || null,
      error: botInfo.description || webhookInfo.description || null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Simulate a Telegram command from the web UI
 * POST /api/telegram/simulate
 */
export async function simulateCommand(req: Request, res: Response, next: NextFunction) {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Command text is required (e.g. "50 coffee" or "/balance")',
      });
    }

    const user = req.user!;
    const chatId = user.telegramChatId || '123456789';
    const fakeUpdate = {
      update_id: Date.now(),
      message: {
        message_id: Date.now(),
        from: {
          id: parseInt(chatId, 10) || 123456789,
          first_name: user.firstName,
          last_name: user.lastName,
          username: user.username || 'user',
        },
        chat: {
          id: chatId,
          first_name: user.firstName,
          type: 'private',
        },
        date: Math.floor(Date.now() / 1000),
        text: text.trim(),
      },
    };

    const rawBotToken = decrypt(user.telegramBotToken);
    const result = await handleTelegramWebhookUpdate(fakeUpdate, rawBotToken, user as any);

    res.json({
      success: true,
      message: 'Command simulated successfully.',
      result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Trigger Daily Briefing on demand
 * POST /api/notifications/send-briefing
 */
export async function triggerDailyBriefing(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await sendDailyBriefing(req.user!.id, {
      forceTelegram: true,
      botToken: req.body?.botToken,
      chatId: req.body?.chatId,
    });

    res.json({
      success: true,
      message: 'Daily Briefing generated and delivered!',
      briefing: result,
    });
  } catch (err) {
    next(err);
  }
}
