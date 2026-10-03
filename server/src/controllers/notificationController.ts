import type { Request, Response, NextFunction } from 'express';
import prisma from '../prisma/client.js';
import { sendTelegramNotification } from '../services/telegramService.js';

export async function getNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    res.json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (err) {
    next(err);
  }
}

export async function markNotificationRead(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const existing = await prisma.notification.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found.',
      });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    res.json({
      success: true,
      notification: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function markAllNotificationsRead(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true },
    });

    res.json({
      success: true,
      message: 'All notifications marked as read.',
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteNotification(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    await prisma.notification.deleteMany({
      where: { id, userId: req.user!.id },
    });

    res.json({
      success: true,
      message: 'Notification removed.',
    });
  } catch (err) {
    next(err);
  }
}

export async function sendTestTelegramAlert(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    const customMessage =
      req.body?.message ||
      `Live Telegram Bot connection verified for ${user.firstName} ${user.lastName}! Current Exchange Rate: $1 USD = MVR ${Number(
        user.usdToMvrRate || 15.42
      ).toFixed(2)}.`;

    const result = await sendTelegramNotification(
      user,
      'Telegram Bot Connected!',
      customMessage,
      {
        botToken: req.body?.botToken,
        chatId: req.body?.chatId,
        force: true,
      }
    );

    if (!result.sent) {
      return res.status(400).json({
        success: false,
        message: `Telegram delivery failed: ${result.reason}`,
      });
    }

    res.json({
      success: true,
      message: 'Telegram notification sent successfully!',
      telegramMessageId: result.messageId,
    });
  } catch (err) {
    next(err);
  }
}
