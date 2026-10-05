import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Edit3,
  Trash2,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api, { Bill, Account, Category } from '../services/api';
import {
  Card,
  Button,
  Badge,
  Modal,
  ConfirmDialog,
  LoadingState,
  Skeleton,
  SkeletonCard,
  SkeletonMetric,
} from '../components/ui';
import { formatCurrency, formatDate } from '../utils/formatters';

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
  const [filterTab, setFilterTab] = useState('ALL');
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
        setSummary(bRes.data.summary || {});
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
      accountId: accounts[0]?.id || '',
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

  const filteredBills = bills.filter((b) => {
    if (filterTab === 'UPCOMING') return b.status === 'UPCOMING';
    if (filterTab === 'OVERDUE') return b.status === 'OVERDUE';
    if (filterTab === 'PAID') return b.status === 'PAID';
    if (filterTab === 'SUBSCRIPTIONS') return b.isSubscription;
    return true;
  });

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
            Bills & Subscriptions
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Monitor fixed monthly commitments, upcoming due dates, and active streaming/software subscriptions.
          </p>
        </div>

        <Button size="sm" onClick={openAddModal}>
          <Plus className="w-4 h-4" /> Add Bill / Subscription
        </Button>
      </div>

      {/* Overdue Warning Banner */}
      {summary.overdueCount > 0 && (
        <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <p className="text-sm font-bold text-white">
                Action Required: {summary.overdueCount} Overdue Bill(s)
              </p>
              <p className="text-xs text-rose-200/80">
                Review overdue payments below and click "Mark as Paid" once settled.
              </p>
            </div>
          </div>
          <Button variant="danger" size="sm" onClick={() => setFilterTab('OVERDUE')}>
            View Overdue
          </Button>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <Card className="p-3.5 sm:p-5">
          <p className="text-[11px] sm:text-xs uppercase tracking-wider text-slate-400">Monthly Recurring Cost</p>
          <p className="text-xl sm:text-2xl font-extrabold text-white mt-1 truncate">
            {formatCurrency(summary.monthlyRecurringCost, currency, hide)}
          </p>
          <span className="text-[11px] sm:text-xs text-slate-400 mt-1 block truncate">Normalized monthly burn</span>
        </Card>

        <Card className="p-3.5 sm:p-5">
          <p className="text-[11px] sm:text-xs uppercase tracking-wider text-slate-400">Yearly Recurring Cost</p>
          <p className="text-xl sm:text-2xl font-extrabold text-violet-400 mt-1 truncate">
            {formatCurrency(summary.yearlyRecurringCost, currency, hide)}
          </p>
          <span className="text-[11px] sm:text-xs text-slate-400 mt-1 block truncate">12-month annualized total</span>
        </Card>

        <Card className="p-3.5 sm:p-5">
          <p className="text-[11px] sm:text-xs uppercase tracking-wider text-slate-400">Active Subscriptions</p>
          <p className="text-xl sm:text-2xl font-extrabold text-cyan-400 mt-1 truncate">
            {summary.subscriptionCount} Active
          </p>
          <span className="text-[11px] sm:text-xs text-slate-400 mt-1 block truncate">Digital & recurring plans</span>
        </Card>

        <Card className="p-3.5 sm:p-5">
          <p className="text-[11px] sm:text-xs uppercase tracking-wider text-slate-400">Upcoming & Overdue</p>
          <p className="text-xl sm:text-2xl font-extrabold text-amber-400 mt-1 truncate">
            {summary.upcomingCount} Due • {summary.overdueCount} Late
          </p>
          <span className="text-[11px] sm:text-xs text-slate-400 mt-1 block truncate">Next 30 days cycle</span>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {[
          { id: 'ALL', label: `All (${bills.length})` },
          { id: 'UPCOMING', label: `Upcoming (${summary.upcomingCount})` },
          { id: 'OVERDUE', label: `Overdue (${summary.overdueCount})` },
          { id: 'PAID', label: 'Paid' },
          { id: 'SUBSCRIPTIONS', label: 'Subscriptions Only' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setFilterTab(t.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 whitespace-nowrap cursor-pointer ${
              filterTab === t.id
                ? 'bg-violet-600 text-white'
                : 'bg-white/[0.04] text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Bills List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBills.map((bill) => (
          <Card key={bill.id} className="flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">{bill.name}</h3>
                    {bill.autoPay && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300">
                        <Zap className="w-2.5 h-2.5" /> AutoPay
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {bill.category?.name || 'Utilities'} • {bill.account?.name || 'Primary'}
                  </p>
                </div>

                <Badge
                  variant={
                    bill.status === 'OVERDUE'
                      ? 'danger'
                      : bill.status === 'PAID'
                      ? 'success'
                      : 'warning'
                  }
                >
                  {bill.status}
                </Badge>
              </div>

              <div className="mt-4 flex items-baseline justify-between">
                <p className="text-2xl font-extrabold text-white font-display">
                  {formatCurrency(bill.amount, currency, hide)}
                  <span className="text-xs font-normal text-slate-400 ml-1">
                    / {bill.frequency.toLowerCase()}
                  </span>
                </p>
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-violet-400" />
                  Due {formatDate(bill.dueDate, user?.dateFormat)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/[0.06]">
              {bill.status !== 'PAID' ? (
                <Button
                  variant="emerald"
                  size="sm"
                  onClick={() => handleMarkPaid(bill)}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Mark as Paid
                </Button>
              ) : (
                <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Settled for cycle
                </span>
              )}

              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEditModal(bill)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.07] cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeleteTarget(bill)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Add / Edit Bill Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingBill ? 'Edit Bill / Subscription' : 'Add Bill or Subscription'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Service / Bill Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Netflix, Fiber Internet"
                className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="19.99"
                className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Frequency</label>
              <select
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#181C2C] border border-white/[0.1] text-xs text-white"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="BIWEEKLY">Biweekly</option>
                <option value="WEEKLY">Weekly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Next Due Date</label>
              <input
                type="date"
                required
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Payment Account</label>
              <select
                value={form.accountId}
                onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#181C2C] border border-white/[0.1] text-xs text-white"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Category</label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#181C2C] border border-white/[0.1] text-xs text-white"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{editingBill ? 'Update Bill' : 'Save Bill'}</Button>
          </div>
        </form>
      </Modal>

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
