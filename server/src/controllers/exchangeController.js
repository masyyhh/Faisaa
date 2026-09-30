import prisma from '../prisma/client.js';
import { sendTelegramNotification } from '../services/telegramService.js';

export async function getExchangeOverview(req, res, next) {
  try {
    const userId = req.user.id;
    const [user, exchanges, rateHistory] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { usdToMvrRate: true, currency: true, secondaryCurrency: true },
      }),
      prisma.currencyExchange.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        take: 50,
        include: {
          fromAccount: { select: { id: true, name: true, currency: true } },
          toAccount: { select: { id: true, name: true, currency: true } },
        },
      }),
      prisma.exchangeRateHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        take: 30,
      }),
    ]);

    const usdToMvrExchanges = exchanges.filter(
      (e) => e.fromCurrency === 'USD' && e.toCurrency === 'MVR'
    );
    const totalUsdSold = usdToMvrExchanges.reduce((s, e) => s + e.fromAmount, 0);
    const totalMvrReceived = usdToMvrExchanges.reduce((s, e) => s + e.toAmount, 0);
    const avgExchangeRate =
      totalUsdSold > 0
        ? Number((totalMvrReceived / totalUsdSold).toFixed(2))
        : user?.usdToMvrRate || 15.42;

    res.json({
      success: true,
      currentRate: user?.usdToMvrRate || 15.42,
      baseCurrency: 'MVR',
      secondaryCurrency: 'USD',
      summary: {
        totalExchangesCount: exchanges.length,
        totalUsdExchanged: Number(totalUsdSold.toFixed(2)),
        totalMvrReceived: Number(totalMvrReceived.toFixed(2)),
        averageRateAchieved: avgExchangeRate,
      },
      exchanges,
      rateHistory: rateHistory.map((h) => ({
        id: h.id,
        rate: h.rate,
        note: h.note,
        date: new Date(h.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        createdAt: h.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateExchangeRate(req, res, next) {
  try {
    const userId = req.user.id;
    const { rate, note } = req.body;
    const numRate = parseFloat(rate);

    if (!numRate || numRate <= 0 || numRate > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid USD to MVR exchange rate (e.g. 15.42 or 18.50).',
      });
    }

    const [updatedUser, historyEntry] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { usdToMvrRate: numRate },
      }),
      prisma.exchangeRateHistory.create({
        data: {
          userId,
          rate: numRate,
          note: note || 'Manual exchange rate update',
        },
      }),
    ]);

    const notifTitle = 'USD → MVR Exchange Rate Updated';
    const notifMsg = `Exchange rate updated to $1 USD = MVR ${numRate.toFixed(2)}. All MVR & USD dashboard balances have been adjusted.`;

    await prisma.notification.create({
      data: {
        userId,
        title: notifTitle,
        message: notifMsg,
        type: 'SYSTEM',
        severity: 'INFO',
        actionUrl: '/',
      },
    });

    await sendTelegramNotification(updatedUser, notifTitle, notifMsg);

    res.json({
      success: true,
      usdToMvrRate: updatedUser.usdToMvrRate,
      historyEntry,
      message: `Exchange rate updated to MVR ${numRate.toFixed(2)} per $1 USD.`,
    });
  } catch (err) {
    next(err);
  }
}

export async function createCurrencyExchange(req, res, next) {
  try {
    const userId = req.user.id;
    const {
      fromCurrency = 'USD',
      toCurrency = 'MVR',
      fromAmount,
      exchangeRate,
      fee = 0,
      fromAccountId,
      toAccountId,
      notes,
      date,
      updateGlobalRate = true,
    } = req.body;

    const amt = parseFloat(fromAmount);
    const rate = parseFloat(exchangeRate);
    const numFee = Math.max(0, parseFloat(fee) || 0);

    if (!amt || amt <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount to exchange must be greater than zero.',
      });
    }
    if (!rate || rate <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Exchange rate must be greater than zero.',
      });
    }

    if (
      !['USD', 'MVR'].includes(fromCurrency) ||
      !['USD', 'MVR'].includes(toCurrency) ||
      fromCurrency === toCurrency
    ) {
      return res.status(400).json({
        success: false,
        message: 'Exchange must be between USD ($) and MVR.',
      });
    }

    const rawToAmount =
      fromCurrency === 'USD'
        ? Number((amt * rate).toFixed(2))
        : Number((amt / rate).toFixed(2));
    const toAmount = Number(Math.max(0, rawToAmount - numFee).toFixed(2));

    if (fromAccountId) {
      const checkFrom = await prisma.account.findFirst({ where: { id: fromAccountId, userId } });
      if (!checkFrom) {
        return res.status(403).json({
          success: false,
          message: 'Source account not found or unauthorized.',
        });
      }
    }

    if (toAccountId) {
      const checkTo = await prisma.account.findFirst({ where: { id: toAccountId, userId } });
      if (!checkTo) {
        return res.status(403).json({
          success: false,
          message: 'Destination account not found or unauthorized.',
        });
      }
    }

    const txDate = date ? new Date(date) : new Date();

    const createdExchange = await prisma.$transaction(async (tx) => {
      if (fromAccountId) {
        await tx.account.update({
          where: { id: fromAccountId },
          data: { balance: { decrement: amt } },
        });
      }

      if (toAccountId) {
        await tx.account.update({
          where: { id: toAccountId },
          data: { balance: { increment: toAmount } },
        });
      }

      if (fromAccountId) {
        await tx.transaction.create({
          data: {
            userId,
            accountId: fromAccountId,
            transferToAccountId: toAccountId || null,
            type: 'TRANSFER',
            amount: amt,
            currency: fromCurrency,
            exchangeRateUsed: rate,
            payee:
              fromCurrency === 'USD'
                ? `FX Exchange: $${amt.toFixed(2)} → MVR ${toAmount.toLocaleString()} (@${rate})`
                : `FX Exchange: MVR ${amt.toLocaleString()} → $${toAmount.toFixed(2)} (@${rate})`,
            description: notes || `Currency exchange at rate 1 USD = MVR ${rate}`,
            date: txDate,
          },
        });
      }

      if (updateGlobalRate) {
        await tx.user.update({
          where: { id: userId },
          data: { usdToMvrRate: rate },
        });
        await tx.exchangeRateHistory.create({
          data: {
            userId,
            rate,
            note: `FX Exchange (${fromCurrency} → ${toCurrency})`,
          },
        });
      }

      return tx.currencyExchange.create({
        data: {
          userId,
          fromAccountId: fromAccountId || null,
          toAccountId: toAccountId || null,
          fromCurrency,
          toCurrency,
          fromAmount: amt,
          toAmount,
          exchangeRate: rate,
          notes: notes || null,
          date: txDate,
        },
        include: {
          fromAccount: true,
          toAccount: true,
        },
      });
    });

    const summaryText =
      fromCurrency === 'USD'
        ? `Exchanged $${amt.toFixed(2)} USD into MVR ${toAmount.toLocaleString()} at rate MVR ${rate.toFixed(2)}/$1.`
        : `Exchanged MVR ${amt.toLocaleString()} into $${toAmount.toFixed(2)} USD at rate MVR ${rate.toFixed(2)}/$1.`;

    await prisma.notification.create({
      data: {
        userId,
        title: 'Currency Exchange Completed',
        message: summaryText,
        type: 'SYSTEM',
        severity: 'SUCCESS',
        actionUrl: '/accounts',
      },
    });

    await sendTelegramNotification(userId, 'Currency Exchange ($ ↔ MVR)', summaryText);

    res.status(201).json({
      success: true,
      exchange: createdExchange,
      usdToMvrRate: updateGlobalRate ? rate : undefined,
      message: summaryText,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteCurrencyExchange(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const existing = await prisma.currencyExchange.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Currency exchange record not found.',
      });
    }

    await prisma.$transaction(async (tx) => {
      if (existing.fromAccountId) {
        const fromAcc = await tx.account.findFirst({
          where: { id: existing.fromAccountId, userId },
        });
        if (fromAcc) {
          await tx.account.update({
            where: { id: existing.fromAccountId },
            data: { balance: { increment: existing.fromAmount } },
          });
        }
      }

      if (existing.toAccountId) {
        const toAcc = await tx.account.findFirst({
          where: { id: existing.toAccountId, userId },
        });
        if (toAcc) {
          await tx.account.update({
            where: { id: existing.toAccountId },
            data: { balance: { decrement: existing.toAmount } },
          });
        }
      }

      await tx.currencyExchange.delete({ where: { id } });
    });

    res.json({
      success: true,
      message: 'Exchange record reversed and account balances restored.',
    });
  } catch (err) {
    next(err);
  }
}
