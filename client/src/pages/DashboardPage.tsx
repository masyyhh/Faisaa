import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Plus,
  Eye,
  EyeOff,
  ChevronRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import api, { Account, Transaction, SavingsGoal, Bill, Category } from '../services/api';
import {
  Card,
  Badge,
  ProgressBar,
  LoadingState,
  Button,
  Skeleton,
  SkeletonCard,
  SkeletonChart,
  SkeletonTable,
} from '../components/ui';
import { formatCurrency, formatSecondaryUSD, formatDate, DynamicIcon } from '../utils/formatters';

interface DashboardData {
  metrics: {
    totalBalance?: number;
    savingsRate?: number;
    incomeChangePct?: number;
    expenseChangePct?: number;
    totalIncome?: number;
    totalExpenses?: number;
    netCashflow?: number;
    netWorth?: number;
    usdToMvrRate?: number;
    [key: string]: any;
  };
  accounts: Account[];
  recentTransactions: Transaction[];
  cashflowTrend: Array<{
    date: string;
    income: number;
    expenses: number;
    net: number;
  }>;
  spendingByCategory: Array<{
    categoryId?: string;
    name: string;
    amount: number;
    percentage: number;
    color?: string;
  }>;
  budgetProgress: Array<{
    id: string;
    amount: number;
    spent: number;
    percentage: number;
    category?: Category;
  }>;
  goals: SavingsGoal[];
  upcomingBills: Bill[];
}

export default function DashboardPage() {
  const {
    user,
    toggleHideBalances,
    openTransactionModal,
    openExchangeModal,
    refreshUser,
    triggerDataRefresh,
    addToast,
    refreshTrigger,
  } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState('ALL');
  const [quickRate, setQuickRate] = useState('');
  const [updatingRate, setUpdatingRate] = useState(false);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await api.get('/analytics/dashboard');
        if (res.data.success) {
          setData(res.data);
          setQuickRate(String(res.data.metrics?.usdToMvrRate || user?.usdToMvrRate || 18.45));
        }
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, [refreshTrigger, user?.usdToMvrRate]);

  const handleQuickRateUpdate = async (newRateValue: string | number) => {
    const parsed = typeof newRateValue === 'number' ? newRateValue : parseFloat(newRateValue);
    if (!parsed || parsed <= 0) return;
    setUpdatingRate(true);
    try {
      await api.put('/exchange/rate', {
        rate: parsed,
        note: 'Adjusted from Dashboard',
      });
      await refreshUser();
      triggerDataRefresh();
      addToast(`Rate updated to $1 = MVR ${parsed.toFixed(2)}`, 'success');
    } catch {
      addToast('Could not update exchange rate', 'error');
    } finally {
      setUpdatingRate(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="space-y-6 pb-12 animate-fade-in">
        {/* Hero Balance Card Skeleton */}
        <div className="faisaa-card finora-card bg-[#111218] border border-white/[0.06] rounded-2xl p-6 sm:p-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-2.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-28 rounded-xl" />
              <Skeleton className="h-9 w-28 rounded-xl" />
            </div>
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="faisaa-card finora-card bg-[#111218] border border-white/[0.06] rounded-xl p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-7 w-7 rounded-lg" />
              </div>
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
          ))}
        </div>

        {/* Charts Grid Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <SkeletonChart height="h-72" />
          </div>
          <div>
            <SkeletonCard className="h-full flex flex-col justify-between" />
          </div>
        </div>

        {/* Recent Transactions & Bills Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <SkeletonTable rows={4} />
          </div>
          <div>
            <SkeletonCard className="h-full" />
          </div>
        </div>
      </div>
    );
  }

  const {
    metrics = {},
    accounts = [],
    recentTransactions = [],
    cashflowTrend = [],
    spendingByCategory = [],
    budgetProgress = [],
    goals = [],
    upcomingBills = [],
  } = data || {};

  const liveRate = Number(metrics?.usdToMvrRate || user?.usdToMvrRate || 18.45);

  const selectedAccount =
    selectedAccountId === 'ALL'
      ? null
    : (Array.isArray(accounts) ? accounts : []).find((a) => a?.id === selectedAccountId);

  const totalBalance = Number(metrics?.totalBalance) || 0;
  const savingsRate = Number(metrics?.savingsRate) || 0;
  const incomeChangePct = Number(metrics?.incomeChangePct) || 0;
  const expenseChangePct = Number(metrics?.expenseChangePct) || 0;
  const totalIncome = Number(metrics?.totalIncome) || 0;
  const totalExpenses = Number(metrics?.totalExpenses) || 0;
  const netCashflow = Number(metrics?.netCashflow) || 0;
  const netWorth = Number(metrics?.netWorth ?? metrics?.totalBalance) || 0;

  const displayedBalance = selectedAccount
    ? selectedAccount.currency === 'USD'
      ? (Number(selectedAccount.balance) || 0) * liveRate
      : (Number(selectedAccount.balance) || 0)
    : totalBalance;

  const hide = user?.hideBalances;

  return (
    <div className="space-y-6">
      {/* Minimalist Header + Inline Rate Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white font-display tracking-tight">
            Overview
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Base currency <span className="text-zinc-200 font-medium">MVR</span> • Secondary{' '}
            <span className="text-zinc-200 font-medium">USD ($)</span> valued at{' '}
            <span className="text-emerald-400 font-medium tabular-nums">
              $1 = MVR {liveRate.toFixed(2)}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Compact Inline Rate Editor */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleQuickRateUpdate(quickRate);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.07]"
          >
            <span className="text-[11px] text-zinc-400">$1 =</span>
            <input
              type="number"
              step="0.01"
              min="1"
              value={quickRate}
              onChange={(e) => setQuickRate(e.target.value)}
              aria-label="Exchange rate MVR per USD"
              className="w-14 bg-transparent text-xs font-semibold text-white tabular-nums focus:outline-none text-center"
            />
            <span className="text-[11px] text-zinc-500">MVR</span>
            <button
              type="submit"
              disabled={updatingRate}
              className="ml-1 px-2 py-0.5 rounded bg-white/[0.07] hover:bg-white/[0.12] text-[11px] font-medium text-emerald-400 transition-colors cursor-pointer"
            >
              {updatingRate ? '...' : 'Set'}
            </button>
          </form>

          <Button variant="secondary" size="sm" onClick={openExchangeModal}>
            <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Convert</span>
          </Button>

          <Button size="sm" onClick={() => openTransactionModal('EXPENSE')}>
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </Button>
        </div>
      </div>

      {/* Hero Balance + 4 Minimalist KPI Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4">
        {/* Minimalist Primary Balance Card */}
        <div className="hero-card-preserve lg:col-span-5 rounded-2xl p-5 sm:p-6 bg-[#14151C] border border-white/[0.08] flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-400">Total Balance</span>
                <button
                  onClick={toggleHideBalances}
                  aria-label="Toggle balance visibility"
                  className="p-1 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  {hide ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                aria-label="Filter balance by account"
                className="max-w-[150px] sm:max-w-none px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08] text-xs text-zinc-200 focus:outline-none cursor-pointer truncate"
              >
                <option value="ALL">All Accounts ({accounts.length})</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currency})
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 sm:mt-5">
              <p className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-white font-display tabular-nums break-words">
                {formatCurrency(displayedBalance, 'MVR', hide)}
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5">
                <span className="text-xs font-medium text-emerald-400 tabular-nums">
                  {formatSecondaryUSD(displayedBalance, liveRate, hide)} USD
                </span>
                <span className="text-zinc-600 hidden sm:inline">•</span>
                <span className="text-xs text-zinc-400">
                  {savingsRate}% savings rate
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mt-5 sm:mt-6 pt-4 border-t border-white/[0.06]">
            <button
              onClick={() => openTransactionModal('INCOME')}
              className="py-2 px-1.5 sm:px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[11px] sm:text-xs font-medium text-zinc-200 flex items-center justify-center gap-1 sm:gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Income</span>
            </button>
            <button
              onClick={() => openTransactionModal('EXPENSE')}
              className="py-2 px-1.5 sm:px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[11px] sm:text-xs font-medium text-zinc-200 flex items-center justify-center gap-1 sm:gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>Expense</span>
            </button>
            <button
              onClick={openExchangeModal}
              className="py-2 px-1.5 sm:px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[11px] sm:text-xs font-medium text-zinc-200 flex items-center justify-center gap-1 sm:gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>$ ↔ MVR</span>
            </button>
          </div>
        </div>

        {/* 4 Minimalist KPI Cards */}
        <div className="lg:col-span-7 grid grid-cols-2 gap-2.5 sm:gap-4">
          <Card className="flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Monthly Income</span>
              <span className="text-[11px] font-medium text-emerald-400 tabular-nums">
                +{incomeChangePct}%
              </span>
            </div>
            <div className="mt-3">
              <p className="text-xl sm:text-2xl font-bold text-white font-display tabular-nums">
                {formatCurrency(totalIncome, 'MVR', hide)}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5 tabular-nums">
                {formatSecondaryUSD(totalIncome, liveRate, hide)} USD
              </p>
            </div>
          </Card>

          <Card className="flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Monthly Expenses</span>
              <span className="text-[11px] font-medium text-zinc-400 tabular-nums">
                {expenseChangePct}%
              </span>
            </div>
            <div className="mt-3">
              <p className="text-xl sm:text-2xl font-bold text-white font-display tabular-nums">
                {formatCurrency(totalExpenses, 'MVR', hide)}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5 tabular-nums">
                {formatSecondaryUSD(totalExpenses, liveRate, hide)} USD
              </p>
            </div>
          </Card>

          <Card className="flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Net Cashflow</span>
              <Badge variant={netCashflow >= 0 ? 'success' : 'danger'}>
                {netCashflow >= 0 ? 'Positive' : 'Deficit'}
              </Badge>
            </div>
            <div className="mt-3">
              <p
                className={`text-xl sm:text-2xl font-bold font-display tabular-nums ${
                  netCashflow >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {netCashflow >= 0 ? '+' : ''}
                {formatCurrency(netCashflow, 'MVR', hide)}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5 tabular-nums">
                {formatSecondaryUSD(netCashflow, liveRate, hide)} USD
              </p>
            </div>
          </Card>

          <Card onClick={() => navigate('/net-worth')} className="flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Net Worth</span>
              <ChevronRight className="w-4 h-4 text-zinc-500" />
            </div>
            <div className="mt-3">
              <p className="text-xl sm:text-2xl font-bold text-white font-display tabular-nums">
                {formatCurrency(netWorth, 'MVR', hide)}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5 tabular-nums">
                {formatSecondaryUSD(netWorth, liveRate, hide)} USD • {accounts.length} accounts
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* Minimalist Account Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {accounts.slice(0, 5).map((acc) => (
          <div
            key={acc.id}
            onClick={() => navigate('/accounts')}
            className="faisaa-card p-3.5 rounded-xl bg-[#111218] border border-white/[0.06] hover:border-white/[0.15] transition-colors cursor-pointer flex flex-col justify-between gap-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-zinc-300 truncate">{acc.name}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white/[0.05] text-zinc-400 shrink-0">
                {acc.currency}
              </span>
            </div>
            <div>
              <p
                className={`text-sm font-bold tabular-nums ${
                  acc.balance < 0 ? 'text-rose-400' : 'text-white'
                }`}
              >
                {formatCurrency(acc.balance, acc.currency, hide)}
              </p>
              {acc.currency === 'USD' ? (
                <span className="block text-[11px] text-zinc-500 tabular-nums mt-0.5">
                  ≈ {formatCurrency(acc.balance * liveRate, 'MVR', hide)}
                </span>
              ) : (
                <span className="block text-[11px] text-zinc-500 mt-0.5 truncate">
                  {acc.institution || acc.type}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row: Minimalist Cashflow + Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-8">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-white">Cashflow</h3>
              <p className="text-xs text-zinc-500">6-month income vs expenses (MVR)</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Income
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400" /> Expenses
              </span>
            </div>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashflowTrend} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="minIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="minExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  stroke="#71717A"
                  fontSize={11}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  stroke="#71717A"
                  fontSize={11}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                />
                <Tooltip
                  formatter={(val: any) => formatCurrency(Number(val) || 0, 'MVR', hide)}
                  contentStyle={{
                    backgroundColor: '#111218',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderRadius: '10px',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="income"
                  name="Income"
                  stroke="#10B981"
                  strokeWidth={1.75}
                  fill="url(#minIncome)"
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  name="Expenses"
                  stroke="#6366F1"
                  strokeWidth={1.75}
                  fill="url(#minExpense)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Top Categories Minimalist Progress List */}
        <Card className="lg:col-span-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Top Spending</h3>
              <span className="text-xs text-zinc-500">This month</span>
            </div>

            {spendingByCategory.length === 0 ? (
              <p className="text-xs text-zinc-500 py-8 text-center">No expenses recorded</p>
            ) : (
              <div className="space-y-3.5">
                {spendingByCategory.slice(0, 5).map((cat) => (
                  <div key={cat.categoryId || cat.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300 font-medium">{cat.name}</span>
                      <span className="text-white font-semibold tabular-nums">
                        {formatCurrency(cat.amount, 'MVR', hide)}{' '}
                        <span className="text-zinc-500 font-normal">({cat.percentage}%)</span>
                      </span>
                    </div>
                    <ProgressBar value={cat.percentage} color={cat.color || '#6366F1'} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => navigate('/analytics')}
            className="mt-5 pt-3 border-t border-white/[0.05] text-xs font-medium text-zinc-400 hover:text-white flex items-center justify-between transition-colors cursor-pointer"
          >
            <span>View full breakdown</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </Card>
      </div>

      {/* Bottom Split: Recent Transactions + Budgets & Goals */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Minimalist Recent Transactions List */}
        <Card className="lg:col-span-7">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Recent Transactions</h3>
            <button
              onClick={() => navigate('/transactions')}
              className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              View all <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-white/[0.05]">
            {recentTransactions.slice(0, 6).map((tx) => (
              <div
                key={tx.id}
                onClick={() => openTransactionModal(tx.type, tx)}
                className="py-3 flex items-center justify-between gap-3 hover:bg-white/[0.02] -mx-2 px-2 rounded-lg transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-zinc-300 shrink-0">
                    <DynamicIcon name={tx.category?.icon || 'receipt'} className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white truncate">{tx.payee}</p>
                    <p className="text-[11px] text-zinc-500 truncate">
                      {tx.category?.name || tx.type} • {tx.account?.name} • {formatDate(tx.date)}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p
                    className={`text-xs font-semibold tabular-nums ${
                      tx.type === 'INCOME' ? 'text-emerald-400' : 'text-white'
                    }`}
                  >
                    {tx.type === 'INCOME' ? '+' : tx.type === 'EXPENSE' ? '-' : ''}
                    {formatCurrency(tx.amount, tx.currency || tx.account?.currency || 'MVR', hide)}
                  </p>
                  {tx.currency === 'USD' && (
                    <span className="block text-[10px] text-zinc-500 tabular-nums">
                      ≈ {formatCurrency(tx.amount * liveRate, 'MVR', hide)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Budgets & Goals Summary Column */}
        <div className="lg:col-span-5 space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-sm font-semibold text-white">Monthly Budgets</h3>
              <button
                onClick={() => navigate('/budgets')}
                className="text-xs text-zinc-400 hover:text-white cursor-pointer"
              >
                Manage →
              </button>
            </div>
            <div className="space-y-3">
              {budgetProgress.slice(0, 3).map((b) => (
                <div key={b.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300 font-medium">{b.category?.name}</span>
                    <span className="text-zinc-400 tabular-nums">
                      {formatCurrency(b.spent, 'MVR', hide)} / {formatCurrency(b.amount, 'MVR', hide)}
                    </span>
                  </div>
                  <ProgressBar
                    value={b.percentage}
                    color={
                      b.percentage >= 100
                        ? '#F43F5E'
                        : b.percentage >= 80
                        ? '#F59E0B'
                        : b.category?.color || '#10B981'
                    }
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-sm font-semibold text-white">Upcoming Bills & Goals</h3>
              <button
                onClick={() => navigate('/bills')}
                className="text-xs text-zinc-400 hover:text-white cursor-pointer"
              >
                View all →
              </button>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {upcomingBills.slice(0, 3).map((bill) => (
                <div key={bill.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-medium text-white">{bill.name}</p>
                    <p className="text-[11px] text-zinc-500">Due {formatDate(bill.dueDate)}</p>
                  </div>
                  <span className="font-semibold text-white tabular-nums">
                    {formatCurrency(bill.amount, 'MVR', hide)}
                  </span>
                </div>
              ))}
              {goals.slice(0, 2).map((g) => (
                <div key={g.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-medium text-zinc-300">{g.name}</p>
                    <p className="text-[11px] text-zinc-500">Goal • {g.percentage}% funded</p>
                  </div>
                  <span className="font-semibold text-emerald-400 tabular-nums">
                    {formatCurrency(g.currentAmount, 'MVR', hide)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
