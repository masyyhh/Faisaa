import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Card, LoadingState, Badge } from '../components/ui';
import { formatCurrency } from '../utils/formatters';

const DATE_RANGES = [
  { id: 'this_week', label: 'This Week' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'last_3_months', label: 'Last 3 Months' },
  { id: 'last_6_months', label: 'Last 6 Months' },
  { id: 'this_year', label: 'This Year' },
  { id: 'custom', label: 'Custom Range' },
];

export default function AnalyticsPage() {
  const { user, refreshTrigger } = useAuth();

  const [range, setRange] = useState('last_6_months');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [cashflowData, setCashflowData] = useState({ timeline: [], totals: {} });
  const [categoryData, setCategoryData] = useState({
    spendingByCategory: [],
    spendingByMerchant: [],
  });
  const [accounts, setAccounts] = useState([]);
  const [budgetPerf, setBudgetPerf] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        range,
        ...(range === 'custom' ? { startDate: customStart, endDate: customEnd } : {}),
      };
      const [cfRes, catRes, accRes, budRes] = await Promise.all([
        api.get('/analytics/cashflow', { params }),
        api.get('/analytics/categories', { params }),
        api.get('/accounts'),
        api.get('/analytics/budgets'),
      ]);

      if (cfRes.data.success) setCashflowData(cfRes.data);
      if (catRes.data.success) setCategoryData(catRes.data);
      if (accRes.data.success) setAccounts(accRes.data.accounts || []);
      if (budRes.data.success) setBudgetPerf(budRes.data.performance || []);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [range, customStart, customEnd]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics, refreshTrigger]);

  const currency = user?.currency || 'MVR';
  const hide = user?.hideBalances;

  if (loading && cashflowData.timeline.length === 0) {
    return <LoadingState label="Crunching multi-dimensional financial analytics..." />;
  }

  const { timeline = [], totals = {} } = cashflowData;
  const { spendingByCategory = [], spendingByMerchant = [] } = categoryData;

  return (
    <div className="space-y-6">
      {/* Header & Date Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
            Financial Intelligence & Analytics
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            8 interactive visualizations across cashflow, categories, merchants, accounts, and savings growth.
          </p>
        </div>

        {/* Date Filter Pills */}
        <div className="flex items-center gap-1.5 bg-white/[0.03] border border-white/[0.08] p-1.5 rounded-2xl overflow-x-auto no-scrollbar max-w-full">
          {DATE_RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 whitespace-nowrap cursor-pointer ${
                range === r.id
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-600/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {range === 'custom' && (
        <Card className="flex flex-wrap items-center gap-3 py-3">
          <span className="text-xs text-slate-400">Custom Date Filter:</span>
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/[0.1] text-xs text-white"
          />
          <span className="text-xs text-slate-500">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/[0.1] text-xs text-white"
          />
        </Card>
      )}

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
        <Card className="p-3.5 sm:p-5">
          <p className="text-[11px] sm:text-xs text-slate-400">Period Income</p>
          <p className="text-lg sm:text-2xl font-extrabold text-emerald-400 mt-1 truncate">
            {formatCurrency(totals.totalIncome, currency, hide)}
          </p>
        </Card>
        <Card className="p-3.5 sm:p-5">
          <p className="text-[11px] sm:text-xs text-slate-400">Period Expenses</p>
          <p className="text-lg sm:text-2xl font-extrabold text-rose-400 mt-1 truncate">
            {formatCurrency(totals.totalExpenses, currency, hide)}
          </p>
        </Card>
        <Card className="p-3.5 sm:p-5">
          <p className="text-[11px] sm:text-xs text-slate-400">Net Cashflow</p>
          <p className="text-lg sm:text-2xl font-extrabold text-white mt-1 truncate">
            {formatCurrency(totals.netCashflow, currency, hide)}
          </p>
        </Card>
        <Card className="p-3.5 sm:p-5">
          <p className="text-[11px] sm:text-xs text-slate-400">Savings Efficiency</p>
          <p className="text-lg sm:text-2xl font-extrabold text-violet-400 mt-1 truncate">{totals.savingsRate}%</p>
        </Card>
      </div>

      {/* Row 1: 1. Income vs Expenses + 2. Cashflow Over Time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="min-w-0">
          <div className="mb-4">
            <h3 className="text-base font-bold text-white">1. Income vs Expenses</h3>
            <p className="text-xs text-slate-400">Direct side-by-side comparison per period</p>
          </div>
          <div className="h-68 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeline} barGap={6}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" stroke="#64748B" fontSize={11} />
                <YAxis stroke="#64748B" fontSize={11} />
                <Tooltip
                  formatter={(v) => formatCurrency(v, currency, hide)}
                  contentStyle={{
                    backgroundColor: '#121523',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="income" name="Income" fill="#10B981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#F43F5E" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="min-w-0">
          <div className="mb-4">
            <h3 className="text-base font-bold text-white">2. Net Cashflow Over Time</h3>
            <p className="text-xs text-slate-400">Net surplus (Income minus Expenses) trajectory</p>
          </div>
          <div className="h-68 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline}>
                <defs>
                  <linearGradient id="netCashGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" stroke="#64748B" fontSize={11} />
                <YAxis stroke="#64748B" fontSize={11} />
                <Tooltip
                  formatter={(v) => formatCurrency(v, currency, hide)}
                  contentStyle={{
                    backgroundColor: '#121523',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="net"
                  name="Net Cashflow"
                  stroke="#8B5CF6"
                  strokeWidth={2.5}
                  fill="url(#netCashGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Row 2: 3. Spending by Category + 4. Spending by Merchant */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="min-w-0">
          <div className="mb-4">
            <h3 className="text-base font-bold text-white">3. Spending by Category</h3>
            <p className="text-xs text-slate-400">Proportional share of total expenses</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-4">
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={spendingByCategory}
                    dataKey="amount"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {spendingByCategory.map((c, idx) => (
                      <Cell key={idx} fill={c.color || '#8B5CF6'} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => formatCurrency(v, currency, hide)}
                    contentStyle={{
                      backgroundColor: '#121523',
                      borderColor: 'rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2.5">
              {spendingByCategory.slice(0, 6).map((cat) => (
                <div key={cat.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-slate-300">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    {cat.name}
                  </span>
                  <span className="font-bold text-white">
                    {formatCurrency(cat.amount, currency, hide)} ({cat.percentage}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="min-w-0">
          <div className="mb-4">
            <h3 className="text-base font-bold text-white">4. Top Spending by Merchant</h3>
            <p className="text-xs text-slate-400">Highest volume payees & vendors</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={spendingByMerchant.slice(0, 6)}
                layout="vertical"
                margin={{ left: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" stroke="#64748B" fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="merchant"
                  stroke="#94A3B8"
                  fontSize={11}
                  width={120}
                />
                <Tooltip
                  formatter={(v) => formatCurrency(v, currency, hide)}
                  contentStyle={{
                    backgroundColor: '#121523',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                  }}
                />
                <Bar dataKey="amount" name="Merchant Spend" fill="#06B6D4" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Row 3: 5. Account Balances + 6. Monthly Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="min-w-0">
          <div className="mb-4">
            <h3 className="text-base font-bold text-white">5. Account Balances Breakdown</h3>
            <p className="text-xs text-slate-400">Current distribution across active institutions</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={accounts}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="#64748B" fontSize={11} />
                <YAxis stroke="#64748B" fontSize={11} />
                <Tooltip
                  formatter={(v) => formatCurrency(v, currency, hide)}
                  contentStyle={{
                    backgroundColor: '#121523',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                  }}
                />
                <Bar dataKey="balance" name="Balance" fill="#3B82F6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="min-w-0">
          <div className="mb-4">
            <h3 className="text-base font-bold text-white">6. Monthly Comparison Trend</h3>
            <p className="text-xs text-slate-400">Multi-series monthly income, expense & net lines</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" stroke="#64748B" fontSize={11} />
                <YAxis stroke="#64748B" fontSize={11} />
                <Tooltip
                  formatter={(v) => formatCurrency(v, currency, hide)}
                  contentStyle={{
                    backgroundColor: '#121523',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="income" name="Income" stroke="#10B981" strokeWidth={2.5} />
                <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#F43F5E" strokeWidth={2.5} />
                <Line type="monotone" dataKey="net" name="Net Surplus" stroke="#A855F7" strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Row 4: 7. Budget Performance + 8. Savings Growth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="min-w-0">
          <div className="mb-4">
            <h3 className="text-base font-bold text-white">7. Budget Performance by Category</h3>
            <p className="text-xs text-slate-400">Allocated monthly budget vs actual spend</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={budgetPerf} barGap={6}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="category" stroke="#64748B" fontSize={11} />
                <YAxis stroke="#64748B" fontSize={11} />
                <Tooltip
                  formatter={(v) => formatCurrency(v, currency, hide)}
                  contentStyle={{
                    backgroundColor: '#121523',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="budgeted" name="Budgeted" fill="#6366F1" radius={[6, 6, 0, 0]} />
                <Bar dataKey="actual" name="Actual Spent" fill="#F59E0B" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="min-w-0">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">8. Cumulative Savings Growth</h3>
              <p className="text-xs text-slate-400">Compounding liquid & reserve accumulation</p>
            </div>
            <Badge variant="success">+24.6% Growth</Badge>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline}>
                <defs>
                  <linearGradient id="savingsGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" stroke="#64748B" fontSize={11} />
                <YAxis stroke="#64748B" fontSize={11} />
                <Tooltip
                  formatter={(v) => formatCurrency(v, currency, hide)}
                  contentStyle={{
                    backgroundColor: '#121523',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="savingsGrowth"
                  name="Cumulative Savings"
                  stroke="#10B981"
                  strokeWidth={2.5}
                  fill="url(#savingsGrowthGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
