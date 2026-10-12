import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Edit3,
  Trash2,
  Zap,
  Repeat,
  DollarSign,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api, { Bill, Account, Category } from '../services/api';
import {
  Card,
  Button,
  Badge,
  Modal,
  ConfirmDialog,
  EmptyState,
  Skeleton,
  SkeletonCard,
  SkeletonMetric,
} from '../components/ui';
import { formatCurrency, formatDate } from '../utils/formatters';
import AccountLogo from '../components/AccountLogo';

export default function BillsPage() {
  const { user, addToast, refreshTrigger, triggerDataRefresh } = useAuth();

  const [bills, setBills] = useState<Bill[]>([]);
  const [summary, setSummary] = useState({
    monthlyRecurringCost: 0,
    yearlyRecurringCost: 0,
    upcomingCount: 0,
    overdueCount: 0,
    subscriptionCount: 0,
  });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filterTab, setFilterTab] = useState<'ALL' | 'UPCOMING' | 'OVERDUE' | 'PAID' | 'SUBSCRIPTIONS'>('ALL');
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [form, setForm] = useState({
    name: '',
    amount: '',
    frequency: 'MONTHLY',
    dueDate: new Date().toISOString().split('T')[0],
    accountId: '',
    categoryId: '',
    isSubscription: true,
    autoPay: true,
    notes: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<Bill | null>(null);

  const loadBills = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, aRes, cRes] = await Promise.all([
        api.get('/bills'),
        api.get('/accounts'),
        api.get('/categories'),
      ]);
      if (bRes.data.success) {
        setBills(bRes.data.bills || []);
        setSummary(bRes.data.summary || {
          monthlyRecurringCost: 0,
          yearlyRecurringCost: 0,
          upcomingCount: 0,
          overdueCount: 0,
          subscriptionCount: 0,
        });
      }
      setAccounts(aRes.data.accounts || []);
      setCategories((cRes.data.categories || []).filter((c: Category) => c.type === 'EXPENSE'));
    } catch (err) {
      console.error('Failed to load bills:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBills();
  }, [loadBills, refreshTrigger]);

  const openAddModal = () => {
    setEditingBill(null);
    setForm({
      name: '',
      amount: '',
      frequency: 'MONTHLY',
      dueDate: new Date().toISOString().split('T')[0],
      accountId: accounts.find((a) => a.isDefault)?.id || accounts[0]?.id || '',
      categoryId: categories[0]?.id || '',
      isSubscription: true,
      autoPay: true,
      notes: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (bill: Bill) => {
    setEditingBill(bill);
    setForm({
      name: bill.name,
      amount: String(bill.amount),
      frequency: bill.frequency,
      dueDate: new Date(bill.dueDate).toISOString().split('T')[0],
      accountId: bill.accountId || '',
      categoryId: bill.categoryId || '',
      isSubscription: bill.isSubscription,
      autoPay: bill.autoPay,
      notes: bill.notes || '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        amount: parseFloat(form.amount),
      };
      if (editingBill) {
        await api.put(`/bills/${editingBill.id}`, payload);
        addToast('Bill updated!', 'success');
      } else {
        await api.post('/bills', payload);
        addToast('Bill added!', 'success');
      }
      setModalOpen(false);
      triggerDataRefresh();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to save bill.', 'error');
    }
  };

  const handleMarkPaid = async (bill: Bill) => {
    try {
      await api.post(`/bills/${bill.id}/pay`, { recordTransaction: true });
      addToast(`${bill.name} marked as paid & logged to transactions!`, 'success');
      triggerDataRefresh();
    } catch {
      addToast('Failed to mark bill as paid.', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/bills/${deleteTarget.id}`);
      addToast('Bill removed.', 'info');
      setDeleteTarget(null);
      triggerDataRefresh();
    } catch {
      addToast('Failed to delete bill.', 'error');
    }
  };

  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      if (filterTab === 'UPCOMING') return b.status === 'UPCOMING';
      if (filterTab === 'OVERDUE') return b.status === 'OVERDUE';
      if (filterTab === 'PAID') return b.status === 'PAID';
      if (filterTab === 'SUBSCRIPTIONS') return b.isSubscription;
      return true;
    });
  }, [bills, filterTab]);

  const currency = user?.currency || 'MVR';
  const hide = user?.hideBalances;

  if (loading && bills.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-60" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
        <SkeletonMetric count={4} />
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
            <Repeat className="w-5 h-5 text-indigo-400" />
            Bills &amp; Subscriptions
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Monitor fixed monthly commitments, upcoming due dates, and active streaming/software subscriptions.
          </p>
        </div>

        <Button size="sm" onClick={openAddModal} className="w-full sm:w-auto">
          <Plus className="w-3.5 h-3.5" /> Add Bill / Subscription
        </Button>
      </div>

      {/* Overdue Warning Alert Banner */}
      {summary.overdueCount > 0 && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                Action Required: {summary.overdueCount} Overdue Payment{summary.overdueCount > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-zinc-400 mt-0.5">
                Outstanding commitments need settlement to avoid late fees or account freezes.
              </p>
            </div>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setFilterTab('OVERDUE')}
            className="w-full sm:w-auto shrink-0"
          >
            Review Overdue ({summary.overdueCount})
          </Button>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Monthly Burn - Hero Card */}
        <Card className="p-5 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-[#121422] to-[#0f1019] border-indigo-500/30">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300/90">
              Monthly Recurring Burn
            </span>
            <p className="text-2xl sm:text-3xl font-bold text-white font-display tabular-nums tracking-tight mt-1.5 truncate">
              {formatCurrency(summary.monthlyRecurringCost, currency, hide)}
            </p>
          </div>
          <span className="text-[11px] text-zinc-500 mt-2 block truncate">
            Normalized monthly fixed overhead
          </span>
        </Card>

        {/* Yearly Total */}
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <span className="text-xs font-medium text-zinc-400">Yearly Total</span>
            <p className="text-xl sm:text-2xl font-bold text-indigo-400 font-display tabular-nums tracking-tight mt-1.5 truncate">
              {formatCurrency(summary.yearlyRecurringCost, currency, hide)}
            </p>
          </div>
          <span className="text-[11px] text-zinc-500 mt-2 block truncate">
            Annualized recurring commitments
          </span>
        </Card>

        {/* Active Plans */}
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <span className="text-xs font-medium text-zinc-400">Active Plans</span>
            <p className="text-xl sm:text-2xl font-bold text-sky-400 font-display tabular-nums tracking-tight mt-1.5 truncate">
              {summary.subscriptionCount} Subscriptions
            </p>
          </div>
          <span className="text-[11px] text-zinc-500 mt-2 block truncate">
            Software, streaming &amp; recurring utilities
          </span>
        </Card>

        {/* Upcoming & Overdue */}
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <span className="text-xs font-medium text-zinc-400">Upcoming &amp; Late</span>
            <p className="text-xl sm:text-2xl font-bold text-amber-400 font-display tabular-nums tracking-tight mt-1.5 truncate">
              {summary.upcomingCount} Due {summary.overdueCount > 0 ? `• ${summary.overdueCount} Late` : ''}
            </p>
          </div>
          <span className="text-[11px] text-zinc-500 mt-2 block truncate">
            Next 30 days due window
          </span>
        </Card>
      </div>

      {/* Segmented Filter Control */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="inline-flex p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] gap-1 overflow-x-auto no-scrollbar max-w-full">
          {[
            { id: 'ALL', label: `All (${bills.length})` },
            { id: 'UPCOMING', label: `Upcoming (${summary.upcomingCount})` },
            { id: 'OVERDUE', label: `Overdue (${summary.overdueCount})` },
            { id: 'SUBSCRIPTIONS', label: `Subscriptions (${summary.subscriptionCount})` },
            { id: 'PAID', label: 'Paid & Settled' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 whitespace-nowrap cursor-pointer ${
                filterTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-zinc-500 hidden sm:inline">
          Showing {filteredBills.length} of {bills.length} bills
        </span>
      </div>

      {/* Bills Grid */}
      {filteredBills.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No bills or subscriptions match this filter"
          description="Try selecting a different status filter or add a new recurring obligation."
          action={
            <Button size="sm" onClick={openAddModal}>
              <Plus className="w-3.5 h-3.5" /> Add Bill / Subscription
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {filteredBills.map((bill) => {
            const isOverdue = bill.status === 'OVERDUE';
            const isPaid = bill.status === 'PAID';

            return (
              <Card
                key={bill.id}
                className={`flex flex-col justify-between gap-4 border transition-all ${
                  isOverdue
                    ? 'border-rose-500/30 bg-rose-950/10'
                    : isPaid
                    ? 'border-emerald-500/20 bg-emerald-950/10'
                    : 'border-white/[0.06] hover:border-white/[0.14]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="text-sm sm:text-base font-semibold text-white truncate">
                          {bill.name}
                        </h3>
                        {bill.autoPay && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <Zap className="w-2.5 h-2.5" /> AutoPay
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-zinc-400 truncate">
                        <span>{bill.category?.name || 'Utilities'}</span>
                        <span>•</span>
                        {bill.account && <AccountLogo account={bill.account} size="xs" />}
                        <span className="truncate">{bill.account?.name || 'Default Account'}</span>
                      </div>
                    </div>

                    <Badge
                      variant={
                        isOverdue
                          ? 'danger'
                          : isPaid
                          ? 'success'
                          : 'warning'
                      }
                      className="shrink-0"
                    >
                      {bill.status}
                    </Badge>
                  </div>

                  {/* Dominant Amount */}
                  <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-2xl sm:text-3xl font-bold text-white font-display tabular-nums tracking-tight truncate">
                        {formatCurrency(bill.amount, currency, hide)}
                        <span className="text-xs font-normal text-zinc-500 ml-1.5">
                          / {bill.frequency.toLowerCase()}
                        </span>
                      </p>
                    </div>

                    <span className="text-xs text-zinc-400 flex items-center gap-1 shrink-0 tabular-nums">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      Due {formatDate(bill.dueDate, user?.dateFormat)}
                    </span>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/[0.06]">
                  {!isPaid ? (
                    <Button
                      variant="emerald"
                      size="sm"
                      onClick={() => handleMarkPaid(bill)}
                      className="w-full sm:w-auto"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mark as Paid
                    </Button>
                  ) : (
                    <span className="text-xs text-emerald-400 font-medium flex items-center gap-1 py-1">
                      <CheckCircle2 className="w-4 h-4" /> Settled this cycle
                    </span>
                  )}

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEditModal(bill)}
                      title="Edit bill"
                      className="p-1.5 sm:p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] cursor-pointer transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(bill)}
                      title="Delete bill"
                      className="p-1.5 sm:p-2 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Bill Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingBill ? 'Edit Bill / Subscription' : 'Add Bill or Subscription'}
        subtitle="Manage recurring charges, due dates, and auto-settlement rules"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Service / Bill Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Netflix, Dhiraagu Fiber, Gym"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Amount ({currency})</label>
              <input
                type="number"
                step="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="250.00"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs sm:text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Frequency</label>
              <select
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#141620] border border-white/[0.08] text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="BIWEEKLY">Biweekly</option>
                <option value="WEEKLY">Weekly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Next Due Date</label>
              <input
                type="date"
                required
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-zinc-300">Payment Account</label>
                {accounts.find((a) => a.id === form.accountId) && (
                  <AccountLogo
                    account={accounts.find((a) => a.id === form.accountId)}
                    size="xs"
                  />
                )}
              </div>
              <select
                value={form.accountId}
                onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#141620] border border-white/[0.08] text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}{a.isDefault ? ' ★ Default' : ''} ({a.currency} {a.balance.toFixed(2)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Expense Category</label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#141620] border border-white/[0.08] text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-1 pb-1">
            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.isSubscription}
                onChange={(e) => setForm({ ...form, isSubscription: e.target.checked })}
                className="w-4 h-4 rounded bg-white/[0.04] border-white/[0.1] text-indigo-500 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
              />
              <span>Classify as Subscription (SaaS, Streaming, Gym)</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.autoPay}
                onChange={(e) => setForm({ ...form, autoPay: e.target.checked })}
                className="w-4 h-4 rounded bg-white/[0.04] border-white/[0.1] text-indigo-500 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
              />
              <span>AutoPay enabled (Direct Debit)</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/[0.06]">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{editingBill ? 'Update Bill' : 'Save Bill'}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Bill"
        message={`Delete "${deleteTarget?.name || 'this bill'}" from your recurring bills?`}
      />
    </div>
  );
}
