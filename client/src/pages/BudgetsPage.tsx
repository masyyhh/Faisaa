import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  AlertCircle,
  CheckCircle2,
  PieChart as PieIcon,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import api, { Budget, Category } from '../services/api';
import {
  Card,
  Button,
  Badge,
  ProgressBar,
  Modal,
  ConfirmDialog,
  LoadingState,
  EmptyState,
  Skeleton,
  SkeletonCard,
  SkeletonMetric,
} from '../components/ui';
import { formatCurrency, DynamicIcon } from '../utils/formatters';

export interface BudgetWithMetrics extends Budget {
  name?: string;
  spent?: number;
  remaining?: number;
  percentage?: number;
  overAmount?: number;
  statusState?: string;
}

export default function BudgetsPage() {
  const { user, addToast, refreshTrigger, triggerDataRefresh } = useAuth();

  const [budgets, setBudgets] = useState<BudgetWithMetrics[]>([]);
  const [summary, setSummary] = useState({
    totalBudgeted: 0,
    totalSpent: 0,
    totalRemaining: 0,
    overallPercentage: 0,
    overBudgetCount: 0,
    warningCount: 0,
  });
  const [history, setHistory] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetWithMetrics | null>(null);
  const [form, setForm] = useState({
    categoryId: '',
    amount: '',
    alertThreshold: '80',
  });
  const [deleteTarget, setDeleteTarget] = useState<BudgetWithMetrics | null>(null);

  const loadBudgets = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, cRes] = await Promise.all([
        api.get('/budgets'),
        api.get('/categories'),
      ]);
      if (bRes.data.success) {
        setBudgets(bRes.data.budgets || []);
        setSummary(bRes.data.summary || {});
        setHistory(bRes.data.history || []);
      }
      if (cRes.data.success) {
        setCategories((cRes.data.categories || []).filter((c: Category) => c.type === 'EXPENSE'));
      }
    } catch (err) {
      console.error('Error loading budgets:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBudgets();
  }, [loadBudgets, refreshTrigger]);

  const openAddModal = () => {
    setEditingBudget(null);
    setForm({
      categoryId: categories[0]?.id || '',
      amount: '',
      alertThreshold: '80',
    });
    setModalOpen(true);
  };

  const openEditModal = (budget: BudgetWithMetrics) => {
    setEditingBudget(budget);
    setForm({
      categoryId: budget.categoryId,
      amount: String(budget.amount),
      alertThreshold: String(budget.alertThreshold || 80),
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        categoryId: form.categoryId,
        amount: parseFloat(form.amount),
        alertThreshold: parseFloat(form.alertThreshold || '80'),
      };
      if (editingBudget) {
        await api.put(`/budgets/${editingBudget.id}`, payload);
        addToast('Monthly budget updated!', 'success');
      } else {
        await api.post('/budgets', payload);
        addToast('Monthly budget saved!', 'success');
      }
      setModalOpen(false);
      triggerDataRefresh();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to save budget.', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/budgets/${deleteTarget.id}`);
      addToast('Budget deleted.', 'info');
      setDeleteTarget(null);
      triggerDataRefresh();
    } catch {
      addToast('Failed to delete budget.', 'error');
    }
  };

  const getStateBadge = (state?: string): { label: string; variant: 'danger' | 'warning' | 'success' | 'default'; color: string } => {
    switch (state) {
      case 'over_budget':
        return { label: 'Over Budget', variant: 'danger', color: '#F43F5E' };
      case 'near_limit':
        return { label: 'Near Limit', variant: 'warning', color: '#F97316' };
      case 'warning':
        return { label: 'Warning', variant: 'warning', color: '#F59E0B' };
      default:
        return { label: 'Normal', variant: 'success', color: '#10B981' };
    }
  };

  const currency = user?.currency || 'MVR';
  const hide = user?.hideBalances;

  if (loading && budgets.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-32 rounded-xl" />
          </div>
        </div>
        <SkeletonMetric count={3} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} className="h-44 flex flex-col justify-between" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-display">
            Monthly Budgets
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            Dynamic category limits automatically calculated from your monthly expenses.
          </p>
        </div>

        <Button size="sm" onClick={openAddModal}>
          <Plus className="w-4 h-4" /> Set Monthly Budget
        </Button>
      </div>

      {/* Overall Budget Health Hero */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        <Card className="lg:col-span-5 flex flex-col justify-between p-4 sm:p-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400">
                Overall Budget Health
              </span>
              <Badge
                variant={
                  summary.overallPercentage >= 100
                    ? 'danger'
                    : summary.overallPercentage >= 80
                    ? 'warning'
                    : 'success'
                }
              >
                {summary.overallPercentage}% Used
              </Badge>
            </div>

            <div className="mt-4">
              <p className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-display truncate tabular-nums">
                {formatCurrency(summary.totalSpent, currency, hide)}{' '}
                <span className="text-sm sm:text-base font-normal text-zinc-400">
                  / {formatCurrency(summary.totalBudgeted, currency, hide)}
                </span>
              </p>
              <p className="text-xs text-zinc-400 mt-1 tabular-nums">
                {formatCurrency(summary.totalRemaining, currency, hide)} remaining across{' '}
                {budgets.length} budgeted categories
              </p>
            </div>

            <ProgressBar
              value={summary.overallPercentage}
              color={summary.overallPercentage >= 100 ? '#F43F5E' : '#6366F1'}
              height="h-2.5"
              className="mt-5"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-white/[0.06]">
            <div className="flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              <span className="text-zinc-300">
                <strong className="text-white tabular-nums">{summary.overBudgetCount}</strong> Over Budget
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-zinc-300">
                <strong className="text-white tabular-nums">{budgets.length - summary.overBudgetCount}</strong> Within Limit
              </span>
            </div>
          </div>
        </Card>

        {/* Historical Budget Performance Chart */}
        <Card className="lg:col-span-7 min-w-0 p-4 sm:p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white">
              Historical Budget vs Actual Performance
            </h3>
            <p className="text-xs text-zinc-400">
              6-month comparison of planned monthly limits against real spending
            </p>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history} barGap={6}>
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
                <Bar dataKey="budgeted" name="Budgeted Limit" fill="#6366F1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="spent" name="Actual Spent" fill="#EC4899" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Category Budget Cards Grid */}
      {budgets.length === 0 ? (
        <EmptyState
          icon={PieIcon}
          title="No budgets configured for this month"
          description="Set monthly spending limits for categories like Food, Shopping, Transport, and Entertainment."
          action={
            <Button onClick={openAddModal}>
              <Plus className="w-4 h-4" /> Create First Budget
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {budgets.map((b) => {
            const stateMeta = getStateBadge(b.statusState);
            return (
              <Card key={b.id} className="flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{
                          backgroundColor: `${b.category?.color || '#6366F1'}20`,
                          color: b.category?.color || '#6366F1',
                        }}
                      >
                        <DynamicIcon name={b.category?.icon || 'tag'} className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white">
                          {b.category?.name || b.name}
                        </h3>
                        <Badge variant={stateMeta.variant}>{stateMeta.label}</Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(b)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(b)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="text-xl font-bold tracking-tight text-white font-display tabular-nums">
                          {formatCurrency(b.spent, currency, hide)}
                        </span>
                        <span className="text-xs text-zinc-400 ml-1.5 tabular-nums">
                          of {formatCurrency(b.amount, currency, hide)}
                        </span>
                      </div>
                      <span className="text-xs font-semibold tabular-nums" style={{ color: stateMeta.color }}>
                        {b.percentage}%
                      </span>
                    </div>

                    <ProgressBar
                      value={b.percentage}
                      color={stateMeta.color}
                      height="h-2"
                      className="mt-2.5"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-zinc-400 mt-4 pt-3 border-t border-white/[0.06]">
                  {(b.overAmount || 0) > 0 ? (
                    <span className="text-rose-400 font-semibold tabular-nums">
                      Over by {formatCurrency(b.overAmount, currency, hide)}
                    </span>
                  ) : (
                    <span>
                      Remaining:{' '}
                      <strong className="text-white tabular-nums">
                        {formatCurrency(b.remaining, currency, hide)}
                      </strong>
                    </span>
                  )}
                  <span className="text-[11px] text-zinc-500">Alert at {b.alertThreshold}%</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Budget Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingBudget ? 'Edit Monthly Budget' : 'Set Monthly Budget'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">Expense Category</label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              disabled={Boolean(editingBudget)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-indigo-500/50"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id} className="bg-[#111218] text-white">
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Monthly Budget Limit</label>
              <input
                type="number"
                step="1"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="500"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-indigo-500/50 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Alert Threshold (%)</label>
              <input
                type="number"
                min="10"
                max="100"
                value={form.alertThreshold}
                onChange={(e) => setForm({ ...form, alertThreshold: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-indigo-500/50 tabular-nums"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Budget</Button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Budget"
        message={`Remove the monthly budget for "${deleteTarget?.category?.name || 'this category'}"?`}
      />
    </div>
  );
}
