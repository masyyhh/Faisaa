import type { Request, Response, NextFunction } from 'express';
import prisma from '../prisma/client.js';
import { loanSchema, loanPaymentSchema } from '../validators/schemas.js';

function calculateEstimatedMonths(balance: number, rateAnnualPct: number, monthlyPayment: number): number | null {
  if (balance <= 0) return 0;
  if (monthlyPayment <= 0) return null;

  if (rateAnnualPct <= 0) {
    return Math.ceil(balance / monthlyPayment);
  }

  const monthlyRate = rateAnnualPct / 100 / 12;
  const monthlyInterest = balance * monthlyRate;

  if (monthlyPayment <= monthlyInterest) {
    return null; // Payment doesn't cover interest; will never pay off
  }

  let bal = balance;
  let months = 0;
  while (bal > 0 && months < 600) {
    const interest = bal * monthlyRate;
    const principal = monthlyPayment - interest;
    if (principal <= 0) return null;
    bal -= principal;
    months++;
  }
  return months;
}

export async function getLoans(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;

    // Seamless Zero-Downtime Auto-Migration:
    // Check if the user has legacy accounts with type === 'LOAN' that are not yet tracked in the Loan model
    const legacyAccounts = await prisma.account.findMany({
      where: {
        userId,
        type: 'LOAN',
        loans: { none: {} },
      },
    });

    if (legacyAccounts.length > 0) {
      for (const acc of legacyAccounts) {
        // Prevent concurrent race-condition duplicate creation
        const existingLoan = await prisma.loan.findFirst({
          where: { accountId: acc.id, userId },
        });
        if (existingLoan) continue;
        const absBal = Math.abs(acc.balance);
        const absInit = Math.abs(acc.initialBalance);
        const originalAmount = Math.max(absInit, absBal, 1);
        const remainingBalance = absBal;

        const lowerText = `${acc.name} ${acc.notes || ''}`.toLowerCase();
        let category = 'PERSONAL_LOAN';
        if (lowerText.includes('car') || lowerText.includes('auto') || lowerText.includes('vehicle') || acc.icon === 'car') {
          category = 'VEHICLE';
        } else if (lowerText.includes('mortgage') || lowerText.includes('home') || lowerText.includes('house') || acc.icon === 'home') {
          category = 'MORTGAGE';
        } else if (lowerText.includes('student') || lowerText.includes('education') || lowerText.includes('tuition')) {
          category = 'STUDENT';
        } else if (lowerText.includes('murabaha') || lowerText.includes('islamic') || acc.institution?.toLowerCase().includes('islamic')) {
          category = 'ISLAMIC_FINANCING';
        }

        await prisma.loan.create({
          data: {
            userId,
            name: acc.name,
            type: acc.balance <= 0 ? 'OWED_BY_ME' : 'OWED_TO_ME',
            category,
            lender: acc.institution || null,
            originalAmount,
            remainingBalance,
            interestRate: 0,
            minimumPayment: 0,
            currency: acc.currency || 'MVR',
            accountId: acc.id,
            color: acc.color || '#EF4444',
            notes: acc.notes || null,
            status: remainingBalance === 0 ? 'PAID_OFF' : 'ACTIVE',
          },
        });
      }
    }

    const loans = await prisma.loan.findMany({
      where: { userId },
      orderBy: [{ status: 'asc' }, { remainingBalance: 'desc' }],
      include: {
        account: {
          select: { id: true, name: true, type: true, currency: true, color: true },
        },
        payments: {
          orderBy: { date: 'desc' },
          take: 10,
        },
      },
    });

    const enriched = loans.map((loan) => {
      const paidAmount = Number(Math.max(0, loan.originalAmount - loan.remainingBalance).toFixed(2));
      const progressPercentage = Number(
        loan.originalAmount > 0
          ? Math.min(100, Math.max(0, (paidAmount / loan.originalAmount) * 100)).toFixed(1)
          : 0
      );

      const estimatedMonths = calculateEstimatedMonths(
        loan.remainingBalance,
        loan.interestRate,
        loan.minimumPayment
      );

      let projectedPayoffDate: string | null = null;
      if (estimatedMonths !== null && estimatedMonths > 0) {
        const d = new Date();
        d.setMonth(d.getMonth() + estimatedMonths);
        projectedPayoffDate = d.toISOString();
      }

      const monthlyInterestAmount = Number(
        ((loan.remainingBalance * (loan.interestRate / 100)) / 12).toFixed(2)
      );

      return {
        ...loan,
        paidAmount,
        progressPercentage,
        estimatedMonths,
        projectedPayoffDate,
        monthlyInterestAmount,
      };
    });

    const owedByMe = enriched.filter((l) => l.type === 'OWED_BY_ME');
    const owedToMe = enriched.filter((l) => l.type === 'OWED_TO_ME');

    const activeOwedByMe = owedByMe.filter((l) => l.status === 'ACTIVE');

    // Debt Snowball Strategy: Smallest remaining balance first
    const snowballRanked = [...activeOwedByMe]
      .sort((a, b) => a.remainingBalance - b.remainingBalance)
      .map((l, index) => ({ id: l.id, name: l.name, rank: index + 1, remainingBalance: l.remainingBalance }));

    // Debt Avalanche Strategy: Highest interest rate first
    const avalancheRanked = [...activeOwedByMe]
      .sort((a, b) => b.interestRate - a.interestRate || a.remainingBalance - b.remainingBalance)
      .map((l, index) => ({ id: l.id, name: l.name, rank: index + 1, interestRate: l.interestRate }));

    const totalOwedByMe = Number(
      owedByMe
        .filter((l) => l.status === 'ACTIVE')
        .reduce((sum, l) => sum + l.remainingBalance, 0)
        .toFixed(2)
    );

    const totalOwedToMe = Number(
      owedToMe
        .filter((l) => l.status === 'ACTIVE')
        .reduce((sum, l) => sum + l.remainingBalance, 0)
        .toFixed(2)
    );

    const totalMonthlyCommitment = Number(
      activeOwedByMe.reduce((sum, l) => sum + l.minimumPayment, 0).toFixed(2)
    );

    res.json({
      success: true,
      loans: enriched,
      snowballRanked,
      avalancheRanked,
      summary: {
        totalOwedByMe,
        totalOwedToMe,
        netDebtBalance: Number((totalOwedByMe - totalOwedToMe).toFixed(2)),
        totalMonthlyCommitment,
        activeDebtsCount: activeOwedByMe.length,
        activeReceivablesCount: owedToMe.filter((l) => l.status === 'ACTIVE').length,
        paidOffCount: enriched.filter((l) => l.status === 'PAID_OFF').length,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createLoan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const parsed = loanSchema.parse(req.body);

    if (parsed.accountId) {
      const acc = await prisma.account.findFirst({
        where: { id: parsed.accountId, userId },
      });
      if (!acc) {
        res.status(403).json({ success: false, message: 'Selected account not found or unauthorized.' });
        return;
      }
    }

    const remainingBalance =
      parsed.remainingBalance !== undefined ? parsed.remainingBalance : parsed.originalAmount;

    const loan = await prisma.loan.create({
      data: {
        userId,
        name: parsed.name,
        type: parsed.type,
        category: parsed.category,
        lender: parsed.lender || null,
        originalAmount: parsed.originalAmount,
        remainingBalance,
        interestRate: parsed.interestRate ?? 0,
        minimumPayment: parsed.minimumPayment ?? 0,
        currency: parsed.currency ?? 'MVR',
        startDate: parsed.startDate ? new Date(parsed.startDate) : new Date(),
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
        dueDay: parsed.dueDay ?? 1,
        accountId: parsed.accountId || null,
        color: parsed.color || '#6366F1',
        notes: parsed.notes || null,
        status: parsed.status || 'ACTIVE',
      },
      include: {
        account: {
          select: { id: true, name: true, type: true, currency: true, color: true },
        },
      },
    });

    res.status(201).json({
      success: true,
      loan,
      message: parsed.type === 'OWED_BY_ME' ? 'Loan / debt added successfully!' : 'Receivable / IOU added successfully!',
    });
  } catch (err) {
    next(err);
  }
}

export async function updateLoan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string;
    const parsed = loanSchema.partial().parse(req.body);

    const existing = await prisma.loan.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Loan not found.' });
      return;
    }

    if (parsed.accountId) {
      const acc = await prisma.account.findFirst({
        where: { id: parsed.accountId, userId },
      });
      if (!acc) {
        res.status(403).json({ success: false, message: 'Selected account not found.' });
        return;
      }
    }

    const updated = await prisma.loan.update({
      where: { id },
      data: {
        name: parsed.name,
        type: parsed.type,
        category: parsed.category,
        lender: parsed.lender !== undefined ? parsed.lender : undefined,
        originalAmount: parsed.originalAmount,
        remainingBalance: parsed.remainingBalance,
        interestRate: parsed.interestRate,
        minimumPayment: parsed.minimumPayment,
        currency: parsed.currency,
        startDate: parsed.startDate ? new Date(parsed.startDate) : undefined,
        dueDate: parsed.dueDate !== undefined ? (parsed.dueDate ? new Date(parsed.dueDate) : null) : undefined,
        dueDay: parsed.dueDay,
        accountId: parsed.accountId !== undefined ? parsed.accountId : undefined,
        color: parsed.color,
        notes: parsed.notes !== undefined ? parsed.notes : undefined,
        status: parsed.status,
      },
      include: {
        account: {
          select: { id: true, name: true, type: true, currency: true, color: true },
        },
      },
    });

    res.json({ success: true, loan: updated, message: 'Loan updated successfully.' });
  } catch (err) {
    next(err);
  }
}

export async function deleteLoan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const existing = await prisma.loan.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Loan not found.' });
      return;
    }

    await prisma.loan.delete({ where: { id } });
    res.json({ success: true, message: 'Loan and payment history deleted.' });
  } catch (err) {
    next(err);
  }
}

export async function payLoanInstallment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string;
    const parsed = loanPaymentSchema.parse(req.body);

    const loan = await prisma.loan.findFirst({
      where: { id, userId },
      include: { account: true },
    });

    if (!loan) {
      res.status(404).json({ success: false, message: 'Loan not found.' });
      return;
    }

    if (loan.status === 'PAID_OFF' || loan.remainingBalance <= 0) {
      res.status(400).json({ success: false, message: 'This loan has already been fully paid off.' });
      return;
    }

    if (parsed.accountId) {
      const acc = await prisma.account.findFirst({
        where: { id: parsed.accountId, userId },
      });
      if (!acc) {
        res.status(403).json({ success: false, message: 'Selected payment account not found or unauthorized.' });
        return;
      }
    }

    // Calculate principal and interest split
    let interestAmount = parsed.interestAmount !== undefined ? parsed.interestAmount : 0;
    let principalAmount = parsed.principalAmount;

    if (parsed.interestAmount === undefined) {
      if (loan.interestRate > 0) {
        const monthlyInterest = (loan.remainingBalance * (loan.interestRate / 100)) / 12;
        interestAmount = Number(Math.min(monthlyInterest, parsed.amount).toFixed(2));
        principalAmount = Number(Math.max(0, parsed.amount - interestAmount).toFixed(2));
      } else {
        interestAmount = 0;
        principalAmount = parsed.amount;
      }
    } else if (principalAmount === undefined) {
      principalAmount = Number(Math.max(0, parsed.amount - interestAmount).toFixed(2));
    }

    // Guardrail against over-paying more principal than remaining balance
    if (principalAmount > loan.remainingBalance) {
      principalAmount = loan.remainingBalance;
    }

    const payAmount = Number((principalAmount + interestAmount).toFixed(2));
    const newRemainingBalance = Number(Math.max(0, loan.remainingBalance - principalAmount).toFixed(2));
    const isPaidOff = newRemainingBalance === 0;
    const newStatus = isPaidOff ? 'PAID_OFF' : loan.status;

    const paymentDate = parsed.date ? new Date(parsed.date) : new Date();
    const sourceAccountId = parsed.accountId || loan.accountId;

    let transactionId: string | null = null;

    // Execute atomic transaction for balance, transaction creation, and loan payment
    const result = await prisma.$transaction(async (tx) => {
      // 1. If an account is linked, create the corresponding bank transaction & update balance
      if (sourceAccountId) {
        const account = await tx.account.findFirst({
          where: { id: sourceAccountId, userId },
        });

        if (account) {
          if (loan.type === 'OWED_BY_ME') {
            // Expense from account to pay loan installment
            await tx.account.update({
              where: { id: sourceAccountId },
              data: { balance: { decrement: payAmount } },
            });

            const newTx = await tx.transaction.create({
              data: {
                userId,
                accountId: sourceAccountId,
                type: 'EXPENSE',
                amount: payAmount,
                currency: account.currency,
                payee: loan.lender || loan.name,
                description: `Loan Installment: ${loan.name}`,
                notes: parsed.notes || `Principal: ${principalAmount.toFixed(2)}, Interest: ${interestAmount.toFixed(2)}`,
                date: paymentDate,
              },
            });
            transactionId = newTx.id;
          } else {
            // Income to account as repayment of money owed to user
            await tx.account.update({
              where: { id: sourceAccountId },
              data: { balance: { increment: payAmount } },
            });

            const newTx = await tx.transaction.create({
              data: {
                userId,
                accountId: sourceAccountId,
                type: 'INCOME',
                amount: payAmount,
                currency: account.currency,
                payee: loan.lender || loan.name,
                description: `Debt Repayment Received: ${loan.name}`,
                notes: parsed.notes || `Principal: ${principalAmount.toFixed(2)}`,
                date: paymentDate,
              },
            });
            transactionId = newTx.id;
          }
        }
      }

      // 2. Create the LoanPayment record
      const payment = await tx.loanPayment.create({
        data: {
          loanId: loan.id,
          userId,
          amount: payAmount,
          principalAmount,
          interestAmount,
          date: paymentDate,
          accountId: sourceAccountId,
          transactionId,
          notes: parsed.notes || null,
        },
      });

      // 3. Update the Loan balance & status
      const updatedLoan = await tx.loan.update({
        where: { id: loan.id },
        data: {
          remainingBalance: newRemainingBalance,
          status: newStatus,
        },
        include: {
          account: {
            select: { id: true, name: true, type: true, currency: true, color: true },
          },
        },
      });

      // 4. If loan is newly paid off, create celebratory notification
      if (isPaidOff && loan.status !== 'PAID_OFF') {
        await tx.notification.create({
          data: {
            userId,
            title: `🏆 Debt Paid Off: ${loan.name}!`,
            message:
              loan.type === 'OWED_BY_ME'
                ? `Incredible milestone! You have fully paid off ${loan.name}!`
                : `All funds owed for ${loan.name} have been fully repaid!`,
            type: 'GOAL_MILESTONE',
            severity: 'SUCCESS',
            actionUrl: '/loans',
          },
        });
      }

      return { updatedLoan, payment };
    });

    res.json({
      success: true,
      loan: result.updatedLoan,
      payment: result.payment,
      isPaidOff,
      message: isPaidOff
        ? `🎉 Outstanding! ${loan.name} is now 100% paid off!`
        : `Recorded payment of ${loan.currency} ${payAmount.toFixed(2)}!`,
    });
  } catch (err) {
    next(err);
  }
}
