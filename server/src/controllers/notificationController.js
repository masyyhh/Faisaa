import prisma from '../prisma/client.js';
import { sendTelegramNotification } from '../services/telegramService.js';

export async function getNotifications(req, res, next) {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
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

export async function markNotificationRead(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await prisma.notification.findFirst({
      where: { id, userId: req.user.id },
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

export async function markAllNotificationsRead(req, res, next) {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
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

export async function deleteNotification(req, res, next) {
  try {
    const { id } = req.params;
    await prisma.notification.deleteMany({
      where: { id, userId: req.user.id },
    });

    res.json({
      success: true,
      message: 'Notification removed.',
    });
  } catch (err) {
    next(err);
  }
}

export async function sendTestTelegramAlert(req, res, next) {
  try {
    const customMessage =
      req.body?.message ||
      `Live Telegram Bot connection verified for ${req.user.firstName} ${req.user.lastName}! Current Exchange Rate: $1 USD = MVR ${Number(
        req.user.usdToMvrRate || 15.42
      ).toFixed(2)}.`;

    const result = await sendTelegramNotification(
      req.user,
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
