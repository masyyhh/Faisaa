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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  Card,
  Button,
  Badge,
  ProgressBar,
  Modal,
  ConfirmDialog,
  LoadingState,
} from '../components/ui';
import { formatCurrency, formatDate, DynamicIcon } from '../utils/formatters';

export default function GoalsPage() {
  const { user, addToast, refreshTrigger, triggerDataRefresh } = useAuth();

  const [goals, setGoals] = useState([]);
  const [summary, setSummary] = useState({ totalSaved: 0, totalTarget: 0, overallPercentage: 0 });
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit Goal Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [form, setForm] = useState({
    name: '',
    targetAmount: '',
    currentAmount: '',
    targetDate: '',
    color: '#8B5CF6',
    icon: 'piggy-bank',
    description: '',
  });

  // Contribute / Withdraw Modal
  const [contributeModal, setContributeModal] = useState({
    isOpen: false,
    goal: null,
    action: 'ADD',
    amount: '',
    accountId: '',
  });

  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    try {
      const [gRes, aRes] = await Promise.all([
        api.get('/goals'),
        api.get('/accounts'),
      ]);
      if (gRes.data.success) {
        setGoals(gRes.data.goals || []);
        setSummary(gRes.data.summary || {});
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
      color: '#8B5CF6',
      icon: 'piggy-bank',
      description: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (goal) => {
    setEditingGoal(goal);
    setForm({
      name: goal.name,
      targetAmount: String(goal.targetAmount),
      currentAmount: String(goal.currentAmount),
      targetDate: goal.targetDate ? new Date(goal.targetDate).toISOString().split('T')[0] : '',
      color: goal.color || '#8B5CF6',
      icon: goal.icon || 'piggy-bank',
      description: goal.description || '',
    });
    setModalOpen(true);
  };

  const handleSaveGoal = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        targetAmount: parseFloat(form.targetAmount),
        currentAmount: parseFloat(form.currentAmount || 0),
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
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to save goal.', 'error');
    }
  };

  const handleContributeSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/goals/${contributeModal.goal.id}/contribute`, {
        amount: parseFloat(contributeModal.amount),
        action: contributeModal.action,
        accountId: contributeModal.accountId || undefined,
      });
      addToast(
        contributeModal.action === 'ADD'
          ? `Added funds to ${contributeModal.goal.name}!`
          : `Withdrew funds from ${contributeModal.goal.name}.`,
        'success'
      );
      setContributeModal({ isOpen: false, goal: null, action: 'ADD', amount: '', accountId: '' });
      triggerDataRefresh();
    } catch (err) {
      addToast(err.response?.data?.message || 'Operation failed.', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/goals/${deleteTarget.id}`);
      addToast('Savings goal deleted.', 'info');
      setDeleteTarget(null);
      triggerDataRefresh();
    } catch {
      addToast('Failed to delete goal.', 'error');
    }
  };

  const currency = user?.currency || 'USD';
  const hide = user?.hideBalances;

  if (loading && goals.length === 0) {
    return <LoadingState label="Loading your savings goals & milestones..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
            Savings Goals & Milestones
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Track emergency funds, travel plans, and major purchases with automated milestone tracking.
          </p>
        </div>

        <Button size="sm" onClick={openAddModal}>
          <Plus className="w-4 h-4" /> New Savings Goal
        </Button>
      </div>

      {/* Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <p className="text-xs uppercase tracking-wider text-slate-400">Total Saved Across Goals</p>
          <p className="text-2xl font-extrabold text-emerald-400 mt-1">
            {formatCurrency(summary.totalSaved, currency, hide)}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-slate-400">Combined Target</p>
          <p className="text-2xl font-extrabold text-white mt-1">
            {formatCurrency(summary.totalTarget, currency, hide)}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-slate-400">Overall Completion</p>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-2xl font-extrabold text-violet-400">{summary.overallPercentage}%</p>
            <ProgressBar value={summary.overallPercentage} color="#8B5CF6" height="h-2.5" />
          </div>
        </Card>
      </div>

      {/* Goals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {goals.map((goal) => {
          const radius = 32;
          const circumference = 2 * Math.PI * radius;
          const strokeDashoffset =
            circumference - (Math.min(100, goal.percentage) / 100) * circumference;

          return (
            <Card key={goal.id} className="flex flex-col justify-between gap-5">
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {/* Circular Progress Ring */}
                    <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
                      <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                        <circle
                          cx="40"
                          cy="40"
                          r={radius}
                          stroke="rgba(255,255,255,0.08)"
                          strokeWidth="7"
                          fill="transparent"
                        />
                        <circle
                          cx="40"
                          cy="40"
                          r={radius}
                          stroke={goal.color || '#8B5CF6'}
                          strokeWidth="7"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                          fill="transparent"
                        />
                      </svg>
                      <span className="absolute text-xs font-extrabold text-white">
                        {goal.percentage}%
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-white">{goal.name}</h3>
                        {goal.percentage >= 100 && <Badge variant="success">Completed!</Badge>}
                      </div>
                      {goal.description && (
                        <p className="text-xs text-slate-400 mt-0.5">{goal.description}</p>
                      )}
                      {goal.targetDate && (
                        <p className="text-xs text-violet-300 mt-1.5 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" /> Target:{' '}
                          {formatDate(goal.targetDate, user?.dateFormat)} ({goal.daysRemaining} days
                          left)
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(goal)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.07] cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(goal)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Financial Progress Numbers */}
                <div className="grid grid-cols-3 gap-2 mt-5 p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-center">
                  <div>
                    <span className="text-[11px] text-slate-400 block">Current Saved</span>
                    <span className="text-sm font-extrabold text-emerald-400">
                      {formatCurrency(goal.currentAmount, currency, hide)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">Target Amount</span>
                    <span className="text-sm font-extrabold text-white">
                      {formatCurrency(goal.targetAmount, currency, hide)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">Remaining</span>
                    <span className="text-sm font-extrabold text-violet-300">
                      {formatCurrency(goal.remainingAmount, currency, hide)}
                    </span>
                  </div>
                </div>

                {/* Milestones Strip */}
                {goal.milestones && goal.milestones.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
                      Milestones
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {goal.milestones.map((m, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs ${
                            m.reached
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                              : 'bg-white/[0.02] border-white/[0.06] text-slate-400'
                          }`}
                        >
                          <CheckCircle2
                            className={`w-3.5 h-3.5 shrink-0 ${
                              m.reached ? 'text-emerald-400' : 'text-slate-600'
                            }`}
                          />
                          <span className="truncate">{m.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons: Add Money / Withdraw */}
              <div className="flex items-center gap-3 pt-3 border-t border-white/[0.07]">
                <Button
                  variant="emerald"
                  size="sm"
                  className="flex-1"
                  onClick={() =>
                    setContributeModal({
                      isOpen: true,
                      goal,
                      action: 'ADD',
                      amount: '',
                      accountId: '',
                    })
                  }
                >
                  <ArrowDownLeft className="w-4 h-4" /> + Add Money
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() =>
                    setContributeModal({
                      isOpen: true,
                      goal,
                      action: 'WITHDRAW',
                      amount: '',
                      accountId: '',
                    })
                  }
                >
                  <ArrowUpRight className="w-4 h-4" /> Withdraw
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Add / Withdraw Money Modal */}
      <Modal
        isOpen={contributeModal.isOpen}
        onClose={() =>
          setContributeModal({ isOpen: false, goal: null, action: 'ADD', amount: '', accountId: '' })
        }
        title={
          contributeModal.action === 'ADD'
            ? `Add Funds to ${contributeModal.goal?.name}`
            : `Withdraw from ${contributeModal.goal?.name}`
        }
      >
        <form onSubmit={handleContributeSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-300 mb-1">Amount</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              autoFocus
              value={contributeModal.amount}
              onChange={(e) =>
                setContributeModal({ ...contributeModal, amount: e.target.value })
              }
              placeholder="250.00"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-base font-bold text-white"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">
              Optional: Link Account Balance
            </label>
            <select
              value={contributeModal.accountId}
              onChange={(e) =>
                setContributeModal({ ...contributeModal, accountId: e.target.value })
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#181C2C] border border-white/[0.1] text-xs text-white"
            >
              <option value="">Goal balance only (do not change bank account)</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (${a.balance})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() =>
                setContributeModal({
                  isOpen: false,
                  goal: null,
                  action: 'ADD',
                  amount: '',
                  accountId: '',
                })
              }
            >
              Cancel
            </Button>
            <Button type="submit">
              {contributeModal.action === 'ADD' ? 'Confirm Deposit' : 'Confirm Withdrawal'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create / Edit Goal Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingGoal ? 'Edit Savings Goal' : 'Create Savings Goal'}
      >
        <form onSubmit={handleSaveGoal} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-300 mb-1">Goal Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Emergency Fund, Vacation"
              className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Target Amount</label>
              <input
                type="number"
                step="0.01"
                required
                value={form.targetAmount}
                onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
                placeholder="10000"
                className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Current Saved</label>
              <input
                type="number"
                step="0.01"
                value={form.currentAmount}
                onChange={(e) => setForm({ ...form, currentAmount: e.target.value })}
                placeholder="0"
                className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Target Completion Date</label>
              <input
                type="date"
                value={form.targetDate}
                onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="High-yield reserve"
                className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{editingGoal ? 'Save Changes' : 'Create Goal'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Savings Goal"
        message={`Delete "${deleteTarget?.name}"?`}
      />
    </div>
  );
}
