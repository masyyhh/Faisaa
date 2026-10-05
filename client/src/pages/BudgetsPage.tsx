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
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
            Monthly Budgets
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Dynamic category limits automatically calculated from your monthly expenses.
          </p>
        </div>

        <Button size="sm" onClick={openAddModal}>
          <Plus className="w-4 h-4" /> Set Monthly Budget
        </Button>
      </div>

      {/* Overall Budget Health Hero */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        <Card className="lg:col-span-5 flex flex-col justify-between bg-gradient-to-br from-[#191B30] to-[#121422] p-4 sm:p-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-semibold text-violet-300">
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
              <p className="text-2xl sm:text-3xl font-extrabold text-white font-display truncate">
                {formatCurrency(summary.totalSpent, currency, hide)}{' '}
                <span className="text-sm sm:text-base font-medium text-slate-400">
                  / {formatCurrency(summary.totalBudgeted, currency, hide)}
                </span>
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {formatCurrency(summary.totalRemaining, currency, hide)} remaining across{' '}
                {budgets.length} budgeted categories
              </p>
            </div>

            <ProgressBar
              value={summary.overallPercentage}
              color={summary.overallPercentage >= 100 ? '#F43F5E' : '#8B5CF6'}
              height="h-3"
              className="mt-5"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-white/[0.07]">
            <div className="flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              <span className="text-slate-300">
                <strong>{summary.overBudgetCount}</strong> Over Budget
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-300">
                <strong>{budgets.length - summary.overBudgetCount}</strong> Within Limit
              </span>
            </div>
          </div>
        </Card>

        {/* Historical Budget Performance Chart */}
        <Card className="lg:col-span-7 min-w-0 p-4 sm:p-5">
          <div className="mb-4">
            <h3 className="text-base font-bold text-white">
              Historical Budget vs Actual Performance
            </h3>
            <p className="text-xs text-slate-400">
              6-month comparison of planned monthly limits against real spending
            </p>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history} barGap={6}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" stroke="#64748B" fontSize={12} />
                <YAxis stroke="#64748B" fontSize={12} />
                <Tooltip
                  formatter={(v: any) => formatCurrency(Number(v) || 0, currency, hide)}
                  contentStyle={{
                    backgroundColor: '#121523',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="budgeted" name="Budgeted Limit" fill="#6366F1" radius={[6, 6, 0, 0]} />
                <Bar dataKey="spent" name="Actual Spent" fill="#EC4899" radius={[6, 6, 0, 0]} />
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-5">
          {budgets.map((b) => {
            const stateMeta = getStateBadge(b.statusState);
            return (
              <Card key={b.id} className="flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center"
                        style={{
                          backgroundColor: `${b.category?.color || '#8B5CF6'}22`,
                          color: b.category?.color || '#8B5CF6',
                        }}
                      >
                        <DynamicIcon name={b.category?.icon || 'tag'} className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white">
                          {b.category?.name || b.name}
                        </h3>
                        <Badge variant={stateMeta.variant}>{stateMeta.label}</Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(b)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.07] cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(b)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="text-2xl font-extrabold text-white font-display">
                          {formatCurrency(b.spent, currency, hide)}
                        </span>
                        <span className="text-xs text-slate-400 ml-1.5">
                          of {formatCurrency(b.amount, currency, hide)}
                        </span>
                      </div>
                      <span className="text-sm font-bold" style={{ color: stateMeta.color }}>
                        {b.percentage}%
                      </span>
                    </div>

                    <ProgressBar
                      value={b.percentage}
                      color={stateMeta.color}
                      height="h-2.5"
                      className="mt-2.5"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 mt-4 pt-3 border-t border-white/[0.06]">
                  {(b.overAmount || 0) > 0 ? (
                    <span className="text-rose-400 font-semibold">
                      Over by {formatCurrency(b.overAmount, currency, hide)}
                    </span>
                  ) : (
                    <span>
                      Remaining:{' '}
                      <strong className="text-white">
                        {formatCurrency(b.remaining, currency, hide)}
                      </strong>
                    </span>
                  )}
                  <span>Alert at {b.alertThreshold}%</span>
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
            <label className="block text-xs text-slate-300 mb-1">Expense Category</label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              disabled={Boolean(editingBudget)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#181C2C] border border-white/[0.1] text-sm text-white"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Monthly Budget Limit</label>
              <input
                type="number"
                step="1"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="500"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Alert Threshold (%)</label>
              <input
                type="number"
                min="10"
                max="100"
                value={form.alertThreshold}
                onChange={(e) => setForm({ ...form, alertThreshold: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
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
