import axios, { type InternalAxiosRequestConfig } from 'axios';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  username: string | null;
  email: string;
  currency: string;
  secondaryCurrency: string;
  usdToMvrRate: number;
  dateFormat: string;
  theme: string;
  avatarUrl: string | null;
  notifyBudgetAlerts: boolean;
  notifyBillReminders: boolean;
  notifyGoalMilestones: boolean;
  telegramEnabled: boolean;
  telegramBotToken: string | null;
  telegramChatId: string | null;
  hideBalances: boolean;
  createdAt: string | Date;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: User;
  message?: string;
}

export interface Account {
  id: string;
  userId: string;
  name: string;
  type: string;
  balance: number;
  initialBalance: number;
  currency: string;
  color: string;
  icon: string;
  institution?: string | null;
  lastFour?: string | null;
  notes?: string | null;
  isActive: boolean;
  balanceInMvr?: number;
  balanceInUsd?: number;
  monthlyIncome?: number;
  monthlyExpenses?: number;
  transactionCount?: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface Category {
  id: string;
  userId: string;
  name: string;
  type: string;
  icon: string;
  color: string;
  isDefault: boolean;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  transferToAccountId?: string | null;
  categoryId?: string | null;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amount: number;
  currency: string;
  exchangeRateUsed: number;
  payee: string;
  description?: string | null;
  notes?: string | null;
  date: string | Date;
  isRecurring: boolean;
  recurringId?: string | null;
  account?: Account;
  transferToAccount?: Account | null;
  category?: Category | null;
  tags?: string[];
  tagObjects?: Tag[];
  amountInMvr?: number;
  amountInUsd?: number;
}

export interface Budget {
  id: string;
  userId: string;
  name?: string;
  categoryId: string;
  category: Category;
  amount: number;
  month: number;
  year: number;
  alertThreshold: number;
  color?: string;
  spent?: number;
  remaining?: number;
  percentage?: number;
}

export interface Milestone {
  label: string;
  amount: number;
  reached?: boolean;
}

export interface SavingsGoal {
  id: string;
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string | Date | null;
  color: string;
  icon: string;
  description?: string | null;
  milestones?: Milestone[];
  percentage?: number;
  remainingAmount?: number;
  daysRemaining?: number | null;
  monthlyNeeded?: number | null;
}

export interface Bill {
  id: string;
  userId: string;
  accountId?: string | null;
  categoryId?: string | null;
  name: string;
  amount: number;
  frequency: string;
  dueDate: string | Date;
  dueDay?: number | null;
  status: 'UPCOMING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  isSubscription: boolean;
  autoPay: boolean;
  website?: string | null;
  notes?: string | null;
  lastPaidDate?: string | Date | null;
  account?: Account | null;
  category?: Category | null;
}

export interface RecurringTransaction {
  id: string;
  userId: string;
  accountId: string;
  categoryId?: string | null;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  currency: string;
  payee: string;
  description?: string | null;
  frequency: string;
  interval?: number;
  startDate: string | Date;
  endDate?: string | Date | null;
  nextOccurrence: string | Date;
  isActive: boolean;
  account?: Account;
  category?: Category | null;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER';
  isRead: boolean;
  actionUrl?: string | null;
  createdAt: string | Date;
}

export interface CurrencyExchange {
  id: string;
  userId: string;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmount: number;
  exchangeRate: number;
  notes?: string | null;
  date: string | Date;
  fromAccount?: Account | null;
  toAccount?: Account | null;
}

export interface ExchangeRateHistory {
  id: string;
  rate: number;
  note?: string | null;
  date: string;
  createdAt: string | Date;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  [key: string]: any;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: true, // Enables browser to automatically transmit secure httpOnly cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach Authorization header as secondary fallback for non-cookie environments
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('faisaa_token') || localStorage.getItem('finora_token');
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

interface FailedQueueItem {
  resolve: (token: string | null) => void;
  reject: (error: any) => void;
}

let isRefreshing = false;
let failedQueue: FailedQueueItem[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response Interceptor: Dual-Token Silent Refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Do not attempt refresh on auth endpoints to prevent loops
    const isAuthEndpoint =
      originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/register') ||
      originalRequest?.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise<string | null>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (token) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await api.post('/auth/refresh');
        const newToken = data.token;
        if (newToken) {
          localStorage.setItem('faisaa_token', newToken);
        }
        processQueue(null, newToken);
        return api(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        localStorage.removeItem('faisaa_token');
        localStorage.removeItem('finora_token');
        const path = window.location.pathname;
        if (path !== '/login' && path !== '/register') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
