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
  EmptyState,
  Skeleton,
  SkeletonCard,
  SkeletonMetric,
  Input,
  Select,
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
        setSummary(bRes.data.summary || {
          totalBudgeted: 0,
          totalSpent: 0,
          totalRemaining: 0,
          overallPercentage: 0,
          overBudgetCount: 0,
          warningCount: 0,
        });
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

  const getStateBadge = (state?: string): { label: string; variant: 'danger' | 'warning' | 'success' | 'default' } => {
    switch (state) {
      case 'over_budget':
        return { label: 'Over Budget', variant: 'danger' };
      case 'near_limit':
        return { label: 'Near Limit (90%)', variant: 'warning' };
      case 'warning':
        return { label: 'Warning Threshold', variant: 'warning' };
      default:
        return { label: 'Within Limit', variant: 'success' };
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
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-white/[0.06]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white font-display tracking-tight flex items-center gap-2">
            <PieIcon className="w-5 h-5 text-indigo-400" />
            Monthly Category Budgets
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Dynamic spending caps calculated in real-time against your monthly expense ledger.
          </p>
        </div>

        <Button size="sm" onClick={openAddModal} className="w-full sm:w-auto">
          <Plus className="w-3.5 h-3.5" /> Set Category Budget
        </Button>
      </div>

      {/* Overall Budget Health Hero */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4">
        {/* Overall Health Card */}
        <Card className="lg:col-span-5 flex flex-col justify-between p-5 relative overflow-hidden bg-gradient-to-br from-[#121422] to-[#0f1019] border-indigo-500/30">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300/90">
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
              <p className="text-2xl sm:text-3xl font-bold text-white font-display tabular-nums tracking-tight truncate">
                {formatCurrency(summary.totalSpent, currency, hide)}{' '}
                <span className="text-sm font-normal text-zinc-400">
                  / {formatCurrency(summary.totalBudgeted, currency, hide)}
                </span>
              </p>
              <p className="text-xs text-zinc-400 mt-1 tabular-nums">
                {formatCurrency(summary.totalRemaining, currency, hide)} remaining across{' '}
                {budgets.length} active categories
              </p>
            </div>

            <ProgressBar
              value={summary.overallPercentage}
              color={summary.overallPercentage >= 100 ? '#F43F5E' : '#6366F1'}
              height="h-2"
              className="mt-4"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 mt-5 pt-3 border-t border-white/[0.04]">
            <div className="flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="text-zinc-300">
                <strong className="text-white tabular-nums">{summary.overBudgetCount}</strong> Over Budget
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-zinc-300">
                <strong className="text-white tabular-nums">{budgets.length - summary.overBudgetCount}</strong> Within Limit
              </span>
            </div>
          </div>
        </Card>

        {/* Historical Budget Performance Chart */}
        <Card className="lg:col-span-7 min-w-0 p-5">
          <div className="mb-4">
            <h3 className="text-sm sm:text-base font-semibold text-white">
              Historical Budget vs. Actual Performance
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              6-month trend comparing planned limits against actual spending
            </p>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history} barGap={6} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis dataKey="month" stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} dy={4} />
                <YAxis stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v: any) => formatCurrency(Number(v) || 0, currency, hide)}
                  contentStyle={{
                    backgroundColor: '#111218',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="budgeted" name="Budgeted Limit" fill="#6366F1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="spent" name="Actual Spent" fill="#10B981" radius={[4, 4, 0, 0]} />
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
          description="Set monthly spending limits for categories like Food, Shopping, Utilities, and Transport."
          action={
            <Button onClick={openAddModal} size="sm">
              <Plus className="w-3.5 h-3.5" /> Create First Budget
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {budgets.map((b) => {
            const stateMeta = getStateBadge(b.statusState);
            const isOver = (b.percentage || 0) >= 100;

            return (
              <Card
                key={b.id}
                className={`flex flex-col justify-between border transition-all ${
                  isOver
                    ? 'border-rose-500/30 bg-rose-950/10'
                    : 'border-white/[0.06] hover:border-white/[0.14]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-white/[0.06]"
                        style={{
                          backgroundColor: `${b.category?.color || '#6366F1'}15`,
                          color: b.category?.color || '#818CF8',
                        }}
                      >
                        <DynamicIcon name={b.category?.icon || 'tag'} className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-semibold text-white truncate">
                          {b.category?.name || b.name}
                        </h3>
                        <Badge variant={stateMeta.variant} className="mt-0.5">
                          {stateMeta.label}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEditModal(b)}
                        title="Edit budget"
                        className="p-1.5 sm:p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(b)}
                        title="Delete budget"
                        className="p-1.5 sm:p-2 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Dominant Budget Metrics */}
                  <div className="mt-4 pt-3 border-t border-white/[0.04] space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-zinc-400">Spent vs Target:</span>
                      <p className="text-xl sm:text-2xl font-bold text-white font-display tabular-nums tracking-tight truncate">
                        {formatCurrency(b.spent, currency, hide)}{' '}
                        <span className="text-xs font-normal text-zinc-400">
                          / {formatCurrency(b.amount, currency, hide)}
                        </span>
                      </p>
                    </div>

                    <ProgressBar
                      value={b.percentage || 0}
                      color={isOver ? '#F43F5E' : b.category?.color || '#6366F1'}
                      height="h-2"
                    />

                    <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-0.5 tabular-nums">
                      <span className="font-medium text-white">{b.percentage}% consumed</span>
                      <span>
                        {isOver
                          ? `Over by ${formatCurrency(b.overAmount || 0, currency, hide)}`
                          : `${formatCurrency(b.remaining, currency, hide)} left`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-white/[0.04] text-[11px] text-zinc-500 flex items-center justify-between">
                  <span>Alert threshold: {b.alertThreshold || 80}%</span>
                  <span>Monthly recurring cap</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Budget Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingBudget ? 'Edit Monthly Budget' : 'Set Category Budget'}
        subtitle="Define spending limits and proactive threshold warnings"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Select
            label="Expense Category"
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            required
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <Input
            label={`Budget Cap (${currency})`}
            type="number"
            step="0.01"
            min="0.01"
            required
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="5000.00"
          />

          <Select
            label="Alert Warning Threshold"
            value={form.alertThreshold}
            onChange={(e) => setForm({ ...form, alertThreshold: e.target.value })}
          >
            <option value="50">50% of budget reached</option>
            <option value="75">75% of budget reached</option>
            <option value="80">80% of budget reached (Recommended)</option>
            <option value="90">90% of budget reached</option>
          </Select>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/[0.06]">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{editingBudget ? 'Update Budget' : 'Save Budget'}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Budget"
        message={`Delete monthly budget for "${deleteTarget?.category?.name || 'this category'}"? Your past transaction history will not be affected.`}
      />
    </div>
  );
}
