import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Edit3,
  Trash2,
  CheckCircle2,
  Calendar,
  Target,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api, { SavingsGoal, Milestone, Account } from '../services/api';
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
import { triggerConfetti } from '../utils/confetti';
import { formatCurrency, formatDate, DynamicIcon } from '../utils/formatters';

export interface GoalWithMetrics extends SavingsGoal {
  percentage?: number;
  daysRemaining?: number;
  remainingAmount?: number;
  milestones?: Milestone[];
}

export default function GoalsPage() {
  const { user, addToast, refreshTrigger, triggerDataRefresh } = useAuth();

  const [goals, setGoals] = useState<GoalWithMetrics[]>([]);
  const [summary, setSummary] = useState({ totalSaved: 0, totalTarget: 0, overallPercentage: 0 });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit Goal Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalWithMetrics | null>(null);
  const [form, setForm] = useState({
    name: '',
    targetAmount: '',
    currentAmount: '',
    targetDate: '',
    color: '#6366F1',
    icon: 'piggy-bank',
    description: '',
  });

  // Contribute / Withdraw Modal
  const [contributeModal, setContributeModal] = useState<{
    isOpen: boolean;
    goal: GoalWithMetrics | null;
    action: 'ADD' | 'WITHDRAW';
    amount: string;
    accountId: string;
  }>({
    isOpen: false,
    goal: null,
    action: 'ADD',
    amount: '',
    accountId: '',
  });

  const [deleteTarget, setDeleteTarget] = useState<GoalWithMetrics | null>(null);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    try {
      const [gRes, aRes] = await Promise.all([
        api.get('/goals'),
        api.get('/accounts'),
      ]);
      if (gRes.data.success) {
        setGoals(gRes.data.goals || []);
        setSummary(gRes.data.summary || { totalSaved: 0, totalTarget: 0, overallPercentage: 0 });
      }
      if (aRes.data.success) {
        setAccounts(aRes.data.accounts || []);
      }
    } catch (err) {
      console.error('Error loading goals:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGoals();
  }, [loadGoals, refreshTrigger]);

  const openAddModal = () => {
    setEditingGoal(null);
    setForm({
      name: '',
      targetAmount: '',
      currentAmount: '0',
      targetDate: new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0],
      color: '#6366F1',
      icon: 'piggy-bank',
      description: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (goal: GoalWithMetrics) => {
    setEditingGoal(goal);
    setForm({
      name: goal.name,
      targetAmount: String(goal.targetAmount),
      currentAmount: String(goal.currentAmount),
      targetDate: goal.targetDate ? new Date(goal.targetDate).toISOString().split('T')[0] : '',
      color: goal.color || '#6366F1',
      icon: goal.icon || 'piggy-bank',
      description: goal.description || '',
    });
    setModalOpen(true);
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        targetAmount: parseFloat(form.targetAmount),
        currentAmount: parseFloat(form.currentAmount || '0'),
      };
      if (editingGoal) {
        await api.put(`/goals/${editingGoal.id}`, payload);
        addToast('Savings goal updated!', 'success');
      } else {
        await api.post('/goals', payload);
        addToast('Savings goal created!', 'success');
      }
      setModalOpen(false);
      triggerDataRefresh();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to save goal.', 'error');
    }
  };

  const handleContributeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contributeModal.goal) return;
    try {
      const amt = parseFloat(contributeModal.amount);
      await api.post(`/goals/${contributeModal.goal.id}/contribute`, {
        amount: amt,
        action: contributeModal.action,
        accountId: contributeModal.accountId || undefined,
      });

      if (contributeModal.action === 'ADD' && contributeModal.goal.currentAmount + amt >= contributeModal.goal.targetAmount) {
        triggerConfetti();
        addToast(`🎉 Milestone reached! You hit 100% of your ${contributeModal.goal.name} goal!`, 'success');
      } else {
        addToast(
          contributeModal.action === 'ADD'
            ? `Transferred funds to ${contributeModal.goal.name}!`
            : `Withdrew funds from ${contributeModal.goal.name}.`,
          'success'
        );
      }
      setContributeModal({ isOpen: false, goal: null, action: 'ADD', amount: '', accountId: '' });
      triggerDataRefresh();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Operation failed.', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/goals/${deleteTarget.id}`);
      addToast('Savings goal removed.', 'info');
      setDeleteTarget(null);
      triggerDataRefresh();
    } catch {
      addToast('Failed to delete goal.', 'error');
    }
  };

  const currency = user?.currency || 'MVR';
  const hide = user?.hideBalances;

  if (loading && goals.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
        <SkeletonMetric count={3} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} className="h-56 flex flex-col justify-between" />
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
            <Target className="w-5 h-5 text-indigo-400" />
            Savings Goals &amp; Milestones
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Track emergency reserves, major acquisitions, and travel funds with automated milestone milestones.
          </p>
        </div>

        <Button size="sm" onClick={openAddModal} className="w-full sm:w-auto">
          <Plus className="w-3.5 h-3.5" /> New Savings Goal
        </Button>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
        {/* Total Saved Card */}
        <Card className="p-5 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-[#121422] to-[#0f1019] border-emerald-500/25">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300/90">
                Total Saved in Goals
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white font-display tabular-nums tracking-tight mt-2 truncate">
              {formatCurrency(summary.totalSaved, currency, hide)}
            </p>
          </div>
          <span className="text-[11px] text-zinc-500 mt-2 block">
            Accumulated liquid savings across {goals.length} target goals
          </span>
        </Card>

        {/* Combined Target Card */}
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <span className="text-xs font-medium text-zinc-400">Combined Target Goal</span>
            <p className="text-2xl sm:text-3xl font-bold text-white font-display tabular-nums tracking-tight mt-2 truncate">
              {formatCurrency(summary.totalTarget, currency, hide)}
            </p>
          </div>
          <span className="text-[11px] text-zinc-500 mt-2 block">
            Target capital needed for total goal fulfillment
          </span>
        </Card>

        {/* Overall Completion Card */}
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Overall Progress</span>
              <span className="text-xs font-bold text-indigo-400 tabular-nums">
                {summary.overallPercentage}% Complete
              </span>
            </div>
            <div className="mt-3">
              <ProgressBar value={summary.overallPercentage} color="#6366F1" height="h-2" />
            </div>
          </div>
          <span className="text-[11px] text-zinc-500 mt-2 block">
            {formatCurrency(Math.max(0, summary.totalTarget - summary.totalSaved), currency, hide)} remaining to reach 100%
          </span>
        </Card>
      </div>

      {/* Goals Grid */}
      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No savings goals established yet"
          description="Create your first goal to visualize your emergency fund or next major milestone."
          action={
            <Button onClick={openAddModal} size="sm">
              <Plus className="w-3.5 h-3.5" /> Create Savings Goal
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {goals.map((goal) => {
            const pct = Math.min(100, goal.percentage || 0);
            const isCompleted = pct >= 100;

            return (
              <Card
                key={goal.id}
                className={`p-5 flex flex-col justify-between gap-4 border transition-all ${
                  isCompleted
                    ? 'border-emerald-500/30 bg-emerald-950/10'
                    : 'border-white/[0.06] hover:border-white/[0.14]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-white/[0.06]"
                        style={{
                          backgroundColor: `${goal.color || '#6366F1'}15`,
                          color: goal.color || '#818CF8',
                        }}
                      >
                        <DynamicIcon name={goal.icon || 'target'} className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-semibold text-white truncate">
                          {goal.name}
                        </h3>
                        {goal.description ? (
                          <p className="text-xs text-zinc-400 truncate mt-0.5">{goal.description}</p>
                        ) : goal.targetDate ? (
                          <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-indigo-400" />
                            Target: {formatDate(goal.targetDate, user?.dateFormat)}
                          </p>
                        ) : (
                          <p className="text-xs text-zinc-400 mt-0.5">Open-ended horizon</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEditModal(goal)}
                        title="Edit goal"
                        className="p-1.5 sm:p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(goal)}
                        title="Delete goal"
                        className="p-1.5 sm:p-2 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Dominant Balance & Progress */}
                  <div className="mt-4 pt-3 border-t border-white/[0.04] space-y-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-zinc-400">Current vs Target:</span>
                      <p className="text-xl sm:text-2xl font-bold text-white font-display tabular-nums tracking-tight truncate">
                        {formatCurrency(goal.currentAmount, currency, hide)}{' '}
                        <span className="text-xs font-normal text-zinc-400">
                          / {formatCurrency(goal.targetAmount, currency, hide)}
                        </span>
                      </p>
                    </div>

                    <ProgressBar
                      value={pct}
                      color={isCompleted ? '#10B981' : goal.color || '#6366F1'}
                      height="h-2"
                    />

                    <div className="flex items-center justify-between text-[11px] text-zinc-400 tabular-nums">
                      <span className="font-semibold text-white">{pct}% achieved</span>
                      <span>
                        {isCompleted
                          ? '🎉 Goal Fully Funded'
                          : `${formatCurrency(goal.remainingAmount || 0, currency, hide)} to go`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Actions (Contribute & Withdraw) */}
                <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 w-full">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() =>
                        setContributeModal({
                          isOpen: true,
                          goal,
                          action: 'ADD',
                          amount: '',
                          accountId: accounts.find((a) => a.isDefault)?.id || accounts[0]?.id || '',
                        })
                      }
                      className="w-1/2"
                    >
                      <ArrowDownLeft className="w-3 h-3 mr-1" /> Add Funds
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setContributeModal({
                          isOpen: true,
                          goal,
                          action: 'WITHDRAW',
                          amount: '',
                          accountId: accounts.find((a) => a.isDefault)?.id || accounts[0]?.id || '',
                        })
                      }
                      className="w-1/2"
                    >
                      <ArrowUpRight className="w-3 h-3 mr-1" /> Withdraw
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Goal Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingGoal ? 'Edit Savings Goal' : 'Create Savings Goal'}
        subtitle="Track targeted allocations with milestone progress"
      >
        <form onSubmit={handleSaveGoal} className="space-y-4">
          <Input
            label="Goal Name *"
            required
            placeholder="e.g. Emergency Fund, New Laptop, Japan Trip"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={`Target Amount (${currency}) *`}
              type="number"
              step="0.01"
              min="1"
              required
              placeholder="50000"
              value={form.targetAmount}
              onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
            />
            <Input
              label={`Initial / Current Amount (${currency})`}
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={form.currentAmount}
              onChange={(e) => setForm({ ...form, currentAmount: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Target Horizon Date (Optional)"
              type="date"
              value={form.targetDate}
              onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
            />
            <Select
              label="Accent Color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            >
              <option value="#6366F1">Indigo</option>
              <option value="#10B981">Emerald</option>
              <option value="#3B82F6">Blue</option>
              <option value="#EC4899">Pink</option>
              <option value="#F59E0B">Amber</option>
              <option value="#06B6D4">Cyan</option>
            </Select>
          </div>

          <Input
            label="Description / Purpose (Optional)"
            placeholder="e.g. 6 months of living expenses safely stored"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/[0.06]">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{editingGoal ? 'Update Goal' : 'Save Goal'}</Button>
          </div>
        </form>
      </Modal>

      {/* Contribute / Withdraw Modal */}
      <Modal
        isOpen={contributeModal.isOpen}
        onClose={() =>
          setContributeModal({ isOpen: false, goal: null, action: 'ADD', amount: '', accountId: '' })
        }
        title={
          contributeModal.action === 'ADD'
            ? `Contribute to ${contributeModal.goal?.name}`
            : `Withdraw from ${contributeModal.goal?.name}`
        }
        subtitle="Move funds to or from linked account and adjust goal progress"
      >
        <form onSubmit={handleContributeSubmit} className="space-y-4">
          <Input
            label={`Amount (${currency}) *`}
            type="number"
            step="0.01"
            min="0.01"
            required
            autoFocus
            placeholder="500.00"
            value={contributeModal.amount}
            onChange={(e) => setContributeModal({ ...contributeModal, amount: e.target.value })}
          />

          <Select
            label="Linked Account (Optional)"
            value={contributeModal.accountId}
            onChange={(e) => setContributeModal({ ...contributeModal, accountId: e.target.value })}
          >
            <option value="">None (Adjust goal balance only)</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency} {a.balance.toFixed(2)}){a.isDefault ? ' ★' : ''}
              </option>
            ))}
          </Select>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/[0.06]">
            <Button
              variant="secondary"
              onClick={() =>
                setContributeModal({ isOpen: false, goal: null, action: 'ADD', amount: '', accountId: '' })
              }
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={contributeModal.action === 'ADD' ? 'emerald' : 'primary'}
            >
              {contributeModal.action === 'ADD' ? 'Deposit Funds' : 'Withdraw Funds'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Savings Goal"
        message={`Delete "${deleteTarget?.name}"? Your account balances will not be affected.`}
      />
    </div>
  );
}
