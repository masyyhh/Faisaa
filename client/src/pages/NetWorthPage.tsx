import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Landmark,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  Card,
  Badge,
  ProgressBar,
  LoadingState,
  Skeleton,
  SkeletonCard,
  SkeletonMetric,
  SkeletonChart,
} from '../components/ui';
import { formatCurrency, DynamicIcon } from '../utils/formatters';

export interface NetWorthItem {
  id: string;
  name: string;
  balance: number;
  currency?: string;
  color?: string;
  icon?: string;
  institution?: string;
  type?: string;
}

export interface NetWorthHistoryPoint {
  month: string;
  assets: number;
  liabilities: number;
  netWorth: number;
}

export interface NetWorthData {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  monthlyChange: number;
  monthlyChangePct: number;
  debtToAssetRatio: number;
  history: NetWorthHistoryPoint[];
  assets: NetWorthItem[];
  liabilities: NetWorthItem[];
}

export default function NetWorthPage() {
  const { user, refreshTrigger } = useAuth();
  const [data, setData] = useState<NetWorthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadNetWorth() {
      setLoading(true);
      try {
        const res = await api.get('/analytics/net-worth');
        if (res.data.success) {
          setData(res.data);
        }
      } catch (err) {
        console.error('Error loading net worth:', err);
      } finally {
        setLoading(false);
      }
    }
    loadNetWorth();
  }, [refreshTrigger]);

  if (loading || !data) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <SkeletonMetric count={3} />
        <SkeletonChart height="h-72" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SkeletonCard className="h-64" />
          <SkeletonCard className="h-64" />
        </div>
      </div>
    );
  }

  const currency = user?.currency || 'MVR';
  const hide = user?.hideBalances;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-display">
          Net Worth & Balance Sheet
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
          Net Worth = Total Assets (Cash, Checking, Savings, Investments) minus Total Liabilities (Credit Cards, Loans).
        </p>
      </div>

      {/* Hero Net Worth Card + Assets & Liabilities Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        <div className="hero-card-preserve lg:col-span-6 rounded-3xl p-5 sm:p-7 bg-gradient-to-br from-[#2B1966] via-[#19143D] to-[#0D1024] border border-violet-400/25 shadow-2xl flex flex-col justify-between">
          <div>
            <span className="text-xs uppercase tracking-widest font-semibold text-violet-300">
              Current Net Worth
            </span>
            <p className="text-3xl sm:text-5xl font-bold tracking-tight text-white mt-3 font-display truncate tabular-nums">
              {formatCurrency(data.netWorth, currency, hide)}
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <Badge variant={data.monthlyChange >= 0 ? 'success' : 'danger'}>
                {data.monthlyChange >= 0 ? (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" />
                )}{' '}
                {data.monthlyChange >= 0 ? '+' : '-'}
                {formatCurrency(Math.abs(data.monthlyChange), currency, hide)} ({data.monthlyChangePct}
                %) this month
              </Badge>
              <span className="text-xs text-violet-200/75 tabular-nums">
                Debt-to-Asset Ratio: <strong>{data.debtToAssetRatio}%</strong>
              </span>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-white/10 flex items-center gap-2 text-xs text-violet-200/80">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Calculated dynamically across all active asset and liability accounts</span>
          </div>
        </div>

        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
          <Card className="p-4 sm:p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
                Total Assets
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Landmark className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-400 font-display truncate tabular-nums">
                {formatCurrency(data.totalAssets, currency, hide)}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                {data.assets.length} liquid & investment accounts
              </p>
            </div>
          </Card>

          <Card className="p-4 sm:p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
                Total Liabilities
              </span>
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-2xl sm:text-3xl font-bold tracking-tight text-rose-400 font-display truncate tabular-nums">
                {formatCurrency(data.totalLiabilities, currency, hide)}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                {data.liabilities.length} credit card & loan balances
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* Historical Net Worth Chart */}
      <Card className="min-w-0 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Historical Net Worth Trajectory</h3>
            <p className="text-xs text-zinc-400">
              6-month evolution of Total Assets, Liabilities, and Net Worth
            </p>
          </div>
          <TrendingUp className="w-4 h-4 text-indigo-400" />
        </div>

        <div className="h-76 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.history || []}>
              <defs>
                <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="assetGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="month" stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(v: any) => formatCurrency(Number(v) || 0, currency, hide)}
                contentStyle={{
                  backgroundColor: '#111218',
                  borderColor: 'rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Area
                type="monotone"
                dataKey="assets"
                name="Total Assets"
                stroke="#10B981"
                strokeWidth={2}
                fill="url(#assetGrad)"
              />
              <Area
                type="monotone"
                dataKey="netWorth"
                name="Net Worth"
                stroke="#6366F1"
                strokeWidth={2.5}
                fill="url(#nwGrad)"
              />
              <Area
                type="monotone"
                dataKey="liabilities"
                name="Total Liabilities"
                stroke="#F43F5E"
                strokeWidth={2}
                fillOpacity={0}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Asset vs Liability Detailed Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assets List */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Assets Breakdown</h3>
            <Badge variant="success">{formatCurrency(data.totalAssets, currency, hide)}</Badge>
          </div>

          <div className="space-y-4">
            {data.assets.map((asset: NetWorthItem) => {
              const share =
                data.totalAssets > 0
                  ? Number(((asset.balance / data.totalAssets) * 100).toFixed(1))
                  : 0;
              return (
                <div key={asset.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${asset.color}20`, color: asset.color }}
                      >
                        <DynamicIcon name={asset.icon || 'landmark'} className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-white text-xs">{asset.name}</p>
                        <p className="text-[11px] text-zinc-400">
                          {asset.institution} • {asset.type}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-emerald-400 text-xs tabular-nums">
                        {formatCurrency(asset.balance, currency, hide)}
                      </p>
                      <span className="text-[11px] text-zinc-400 tabular-nums">{share}% of assets</span>
                    </div>
                  </div>
                  <ProgressBar value={share} color={asset.color || '#10B981'} height="h-1.5" />
                </div>
              );
            })}
          </div>
        </Card>

        {/* Liabilities List */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Liabilities & Debt Breakdown</h3>
            <Badge variant="danger">{formatCurrency(data.totalLiabilities, currency, hide)}</Badge>
          </div>

          <div className="space-y-4">
            {data.liabilities.map((liab: NetWorthItem) => {
              const share =
                data.totalLiabilities > 0
                  ? Number(((liab.balance / data.totalLiabilities) * 100).toFixed(1))
                  : 0;
              return (
                <div key={liab.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${liab.color}20`, color: liab.color }}
                      >
                        <DynamicIcon name={liab.icon || 'credit-card'} className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-white text-xs">{liab.name}</p>
                        <p className="text-[11px] text-zinc-400">
                          {liab.institution} • {liab.type}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-rose-400 text-xs tabular-nums">
                        -{formatCurrency(liab.balance, currency, hide)}
                      </p>
                      <span className="text-[11px] text-zinc-400 tabular-nums">{share}% of debt</span>
                    </div>
                  </div>
                  <ProgressBar value={share} color="#F43F5E" height="h-1.5" />
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
