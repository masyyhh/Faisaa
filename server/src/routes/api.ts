import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  register,
  login,
  refreshSession,
  getMe,
  logout,
  updateProfile,
  updatePassword,
} from '../controllers/authController.js';
import {
  getAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
  transferBetweenAccounts,
} from '../controllers/accountController.js';
import {
  getTransactions,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  duplicateTransaction,
} from '../controllers/transactionController.js';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/categoryController.js';
import {
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
} from '../controllers/budgetController.js';
import {
  getGoals,
  createGoal,
  updateGoal,
  contributeToGoal,
  deleteGoal,
} from '../controllers/goalController.js';
import {
  getRecurringTransactions,
  createRecurringTransaction,
  updateRecurringTransaction,
  processRecurringTransactionNow,
  processDueTransactions,
  deleteRecurringTransaction,
} from '../controllers/recurringController.js';
import {
  getBills,
  createBill,
  updateBill,
  payBill,
  deleteBill,
} from '../controllers/billController.js';
import {
  getLoans,
  createLoan,
  updateLoan,
  deleteLoan,
  payLoanInstallment,
} from '../controllers/loanController.js';
import {
  getDashboardSummary,
  getCashflowAnalytics,
  getCategoryAnalytics,
  getNetWorthAnalytics,
  getBudgetAnalytics,
} from '../controllers/analyticsController.js';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  sendTestTelegramAlert,
} from '../controllers/notificationController.js';
import {
  exportCSV,
  exportJSONBackup,
  importCSVTransactions,
  restoreJSONBackup,
} from '../controllers/dataController.js';
import {
  getExchangeOverview,
  updateExchangeRate,
  createCurrencyExchange,
  deleteCurrencyExchange,
} from '../controllers/exchangeController.js';
import {
  handleWebhook,
  setupWebhook,
  getBotStatus,
  simulateCommand,
  triggerDailyBriefing,
  generateLinkingCode,
} from '../controllers/telegramBotController.js';

import prisma from '../prisma/client.js';

const router = Router();

// Deep Health Check (verifies database connectivity & service readiness)
router.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      success: true,
      status: 'healthy',
      service: 'Faisaa REST API (MVR & USD Edition)',
      database: 'connected',
      environment: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(503).json({
      success: false,
      status: 'degraded',
      service: 'Faisaa REST API (MVR & USD Edition)',
      database: 'disconnected',
      error: process.env.NODE_ENV === 'production' ? 'Database unreachable' : errorMsg,
      timestamp: new Date().toISOString(),
    });
  }
});

// Authentication Routes
router.post('/auth/register', register);
router.post('/auth/login', login);
router.post('/auth/refresh', refreshSession);
router.get('/auth/me', protect, getMe);
router.post('/auth/logout', logout);
router.put('/auth/profile', protect, updateProfile);
router.put('/auth/password', protect, updatePassword);

// Accounts Routes
router.get('/accounts', protect, getAccounts);
router.post('/accounts', protect, createAccount);
router.post('/accounts/transfer', protect, transferBetweenAccounts);
router.get('/accounts/:id', protect, getAccountById);
router.put('/accounts/:id', protect, updateAccount);
router.delete('/accounts/:id', protect, deleteAccount);

// Currency Exchange ($ ↔ MVR) & Exchange Rate Tracker Routes
router.get('/exchange', protect, getExchangeOverview);
router.put('/exchange/rate', protect, updateExchangeRate);
router.post('/exchange/convert', protect, createCurrencyExchange);
router.delete('/exchange/:id', protect, deleteCurrencyExchange);

// Transactions Routes
router.get('/transactions', protect, getTransactions);
router.post('/transactions', protect, createTransaction);
router.get('/transactions/:id', protect, getTransactionById);
router.put('/transactions/:id', protect, updateTransaction);
router.delete('/transactions/:id', protect, deleteTransaction);
router.post('/transactions/:id/duplicate', protect, duplicateTransaction);

// Categories Routes
router.get('/categories', protect, getCategories);
router.post('/categories', protect, createCategory);
router.put('/categories/:id', protect, updateCategory);
router.delete('/categories/:id', protect, deleteCategory);

// Budgets Routes
router.get('/budgets', protect, getBudgets);
router.post('/budgets', protect, createBudget);
router.put('/budgets/:id', protect, updateBudget);
router.delete('/budgets/:id', protect, deleteBudget);

// Savings Goals Routes
router.get('/goals', protect, getGoals);
router.post('/goals', protect, createGoal);
router.put('/goals/:id', protect, updateGoal);
router.post('/goals/:id/contribute', protect, contributeToGoal);
router.delete('/goals/:id', protect, deleteGoal);

// Recurring Transactions Routes
router.get('/recurring', protect, getRecurringTransactions);
router.post('/recurring', protect, createRecurringTransaction);
router.put('/recurring/:id', protect, updateRecurringTransaction);
router.post('/recurring/:id/process', protect, processRecurringTransactionNow);
router.post('/recurring/process-due', protect, processDueTransactions);
router.delete('/recurring/:id', protect, deleteRecurringTransaction);

// Bills & Subscriptions Routes
router.get('/bills', protect, getBills);
router.post('/bills', protect, createBill);
router.put('/bills/:id', protect, updateBill);
router.post('/bills/:id/pay', protect, payBill);
router.delete('/bills/:id', protect, deleteBill);

// Dedicated Loans & Debt Payoff Tracker Routes
router.get('/loans', protect, getLoans);
router.post('/loans', protect, createLoan);
router.put('/loans/:id', protect, updateLoan);
router.delete('/loans/:id', protect, deleteLoan);
router.post('/loans/:id/pay', protect, payLoanInstallment);

// Analytics & Dashboard Routes
router.get('/analytics/dashboard', protect, getDashboardSummary);
router.get('/analytics/cashflow', protect, getCashflowAnalytics);
router.get('/analytics/categories', protect, getCategoryAnalytics);
router.get('/analytics/net-worth', protect, getNetWorthAnalytics);
router.get('/analytics/budgets', protect, getBudgetAnalytics);

// Two-Way Telegram Expense Bot Routes
router.post('/telegram/webhook', handleWebhook);
router.post('/telegram/setup-webhook', protect, setupWebhook);
router.post('/telegram/generate-link-code', protect, generateLinkingCode);
router.get('/telegram/status', protect, getBotStatus);
router.post('/telegram/simulate', protect, simulateCommand);

// Notifications & Telegram Bot Routes
router.get('/notifications', protect, getNotifications);
router.post('/notifications/telegram-test', protect, sendTestTelegramAlert);
router.post('/notifications/send-briefing', protect, triggerDailyBriefing);
router.put('/notifications/read-all', protect, markAllNotificationsRead);
router.put('/notifications/:id/read', protect, markNotificationRead);
router.delete('/notifications/:id', protect, deleteNotification);

// Data Import / Export Routes
router.get('/data/export/csv', protect, exportCSV);
router.get('/data/export/json', protect, exportJSONBackup);
router.post('/data/import/csv', protect, importCSVTransactions);
router.post('/data/import/json', protect, restoreJSONBackup);

export default router;
