import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus,
  ArrowLeftRight,
  Edit3,
  Trash2,
  Landmark,
  TrendingUp,
  CreditCard,
  Star,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import api, { Account, Transaction } from '../services/api';
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
import { formatCurrency, formatSecondaryUSD, formatDate, DynamicIcon } from '../utils/formatters';

export interface AccountDetail extends Account {
  balanceHistory?: Array<{ month: string; balance: number }>;
  transactions?: Transaction[];
  totalIncome?: number;
  totalExpenses?: number;
}

const ACCOUNT_TYPES = [
  { value: 'CHECKING', label: 'Checking Account' },
  { value: 'SAVINGS', label: 'Savings Account' },
  { value: 'CREDIT_CARD', label: 'Credit Card' },
  { value: 'INVESTMENT', label: 'Investment / Brokerage' },
  { value: 'CASH', label: 'Cash Wallet' },
  { value: 'LOAN', label: 'Loan / Mortgage' },
  { value: 'OTHER', label: 'Other Account' },
];

const COLOR_SWATCHES = ['#8B5CF6', '#10B981', '#3B82F6', '#EC4899', '#F59E0B', '#06B6D4', '#EF4444'];

export default function AccountsPage() {
  const { user, addToast, openExchangeModal, refreshTrigger, triggerDataRefresh } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summary, setSummary] = useState<{ totalBalance: number; totalAssets: number; totalLiabilities: number; usdToMvrRate?: number }>({ totalBalance: 0, totalAssets: 0, totalLiabilities: 0 });
  const [selectedAccount, setSelectedAccount] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Account Create/Edit Modal
  const [modalOpen, setModalOpen] = useState(Boolean(searchParams.get('new')));
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [form, setForm] = useState({
    name: '',
    type: 'CHECKING',
    balance: '',
    currency: 'MVR',
    color: '#8B5CF6',
    icon: 'landmark',
    institution: '',
    lastFour: '',
    notes: '',
    isDefault: false,
    isActive: true,
  });

  // Transfer Modal
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    description: '',
  });

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/accounts');
      if (data.success) {
        const list = data.accounts || [];
        setAccounts(list);
        setSummary(data.summary || {});
        if (list.length > 0) {
          const targetId = selectedAccount?.id || list[0].id;
          const detailRes = await api.get(`/accounts/${targetId}`);
          if (detailRes.data.success) {
            setSelectedAccount(detailRes.data.account);
          }
        }
      }
    } catch (err) {
      console.error('Error loading accounts:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount?.id]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts, refreshTrigger]);

  const handleSelectAccount = async (accId: string) => {
    try {
      const { data } = await api.get(`/accounts/${accId}`);
      if (data.success) {
        setSelectedAccount(data.account);
      }
    } catch {
      // Ignore
    }
  };

  const handleSetDefaultAccount = async (accId: string, accName: string) => {
    try {
      await api.patch(`/accounts/${accId}/default`);
      addToast(`"${accName}" set as default account.`, 'success');
      triggerDataRefresh();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to set default account.', 'error');
    }
  };

  const openAddModal = () => {
    setEditingAccount(null);
    setForm({
      name: '',
      type: 'CHECKING',
      balance: '',
      currency: 'MVR',
      color: '#8B5CF6',
      icon: 'landmark',
      institution: '',
      lastFour: '',
      notes: '',
      isDefault: accounts.length === 0,
      isActive: true,
    });
    setModalOpen(true);
  };

  const openEditModal = (acc: Account) => {
    setEditingAccount(acc);
    setForm({
      name: acc.name,
      type: acc.type,
      balance: String(acc.balance),
      currency: acc.currency === 'USD' ? 'USD' : 'MVR',
      color: acc.color || '#8B5CF6',
      icon: acc.icon || 'landmark',
      institution: acc.institution || '',
      lastFour: acc.lastFour || '',
      notes: acc.notes || '',
      isDefault: Boolean(acc.isDefault),
      isActive: acc.isActive,
    });
    setModalOpen(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        balance: parseFloat(form.balance || '0'),
      };
      if (editingAccount) {
        await api.put(`/accounts/${editingAccount.id}`, payload);
        addToast('Account updated!', 'success');
      } else {
        await api.post('/accounts', payload);
        addToast('New account created!', 'success');
      }
      setModalOpen(false);
      if (searchParams.get('new')) setSearchParams({});
      triggerDataRefresh();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to save account.', 'error');
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/accounts/transfer', {
        ...transferForm,
        amount: parseFloat(transferForm.amount),
      });
      addToast('Funds transferred between accounts!', 'success');
      setTransferModalOpen(false);
      triggerDataRefresh();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Transfer failed.', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/accounts/${deleteTarget.id}`);
      addToast('Account deleted.', 'info');
      setDeleteTarget(null);
      setSelectedAccount(null);
      triggerDataRefresh();
    } catch {
      addToast('Failed to delete account.', 'error');
    }
  };

  const currency = 'MVR';
  const liveRate = Number(summary.usdToMvrRate || user?.usdToMvrRate || 18.45);
  const hide = user?.hideBalances;

  if (loading && accounts.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
        <SkeletonMetric count={4} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} className="h-48 flex flex-col justify-between" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white font-display tracking-tight">
            Accounts & Institutions
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Manage MVR & USD ($) accounts and convert currencies at live rate ($1 = MVR {liveRate.toFixed(2)}).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={openExchangeModal}
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-400" /> Exchange $ ↔ MVR
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setTransferForm({
                fromAccountId: accounts[0]?.id || '',
                toAccountId: accounts[1]?.id || '',
                amount: '',
                description: 'Internal Transfer',
              });
              setTransferModalOpen(true);
            }}
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-400" /> Transfer Funds
          </Button>
          <Button size="sm" onClick={openAddModal}>
            <Plus className="w-3.5 h-3.5" /> Add Account
          </Button>
        </div>
      </div>

      {/* Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-zinc-400">Total Assets</span>
            <p className="text-xl sm:text-2xl font-bold text-emerald-400 font-display tabular-nums mt-1 truncate">
              {formatCurrency(summary.totalAssets, currency, hide)}
            </p>
            <p className="text-xs text-zinc-500 tabular-nums mt-0.5">
              {formatSecondaryUSD(summary.totalAssets, liveRate, hide)} USD
            </p>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Landmark className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-zinc-400">Total Liabilities</span>
            <p className="text-xl sm:text-2xl font-bold text-rose-400 font-display tabular-nums mt-1 truncate">
              {formatCurrency(summary.totalLiabilities, currency, hide)}
            </p>
            <p className="text-xs text-zinc-500 tabular-nums mt-0.5">
              {formatSecondaryUSD(summary.totalLiabilities, liveRate, hide)} USD
            </p>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-zinc-400">Net Combined Balance</span>
            <p className="text-xl sm:text-2xl font-bold text-white font-display tabular-nums mt-1 truncate">
              {formatCurrency(summary.totalBalance, currency, hide)}
            </p>
            <p className="text-xs text-emerald-400 tabular-nums mt-0.5">
              {formatSecondaryUSD(summary.totalBalance, liveRate, hide)} USD (@ {liveRate.toFixed(2)})
            </p>
          </div>
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </Card>
      </div>

      {/* Accounts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {accounts.map((acc) => {
          const isSelected = selectedAccount?.id === acc.id;
          return (
            <div
              key={acc.id}
              onClick={() => handleSelectAccount(acc.id)}
              className={`faisaa-card rounded-2xl p-4 sm:p-5 border transition-all cursor-pointer relative overflow-hidden ${
                isSelected
                  ? 'bg-[#141622] border-indigo-500/60 shadow-lg shadow-indigo-500/10'
                  : 'bg-[#111218] border-white/[0.06] hover:border-white/[0.14]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 border border-white/[0.06]"
                    style={{ backgroundColor: `${acc.color}15`, color: acc.color }}
                  >
                    <DynamicIcon name={acc.icon} className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="text-sm font-semibold text-white truncate">{acc.name}</h3>
                      {acc.isDefault && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-400/10 text-amber-300 border border-amber-400/20">
                          <Star className="w-2.5 h-2.5 fill-amber-300 text-amber-300" /> Default
                        </span>
                      )}
                      {!acc.isActive && <Badge variant="warning">Archived</Badge>}
                    </div>
                    <p className="text-xs text-zinc-400 truncate mt-0.5">
                      {acc.institution || acc.type} {acc.lastFour ? `•••• ${acc.lastFour}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {!acc.isDefault && (
                    <button
                      onClick={() => handleSetDefaultAccount(acc.id, acc.name)}
                      title="Set as default account"
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-300 hover:bg-amber-400/10 cursor-pointer transition-colors"
                    >
                      <Star className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => openEditModal(acc)}
                    title="Edit account"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] cursor-pointer transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(acc)}
                    title="Delete account"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-4 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[11px] text-zinc-500 uppercase tracking-wider">
                    Balance ({acc.currency})
                  </span>
                  <p
                    className={`text-xl sm:text-2xl font-bold mt-0.5 font-display tabular-nums truncate ${
                      acc.balance < 0 ? 'text-rose-400' : 'text-white'
                    }`}
                  >
                    {formatCurrency(acc.balance, acc.currency, hide)}
                  </p>
                  {acc.currency === 'USD' && (
                    <p className="text-xs font-medium text-emerald-400 mt-0.5 tabular-nums truncate">
                      ≈ {formatCurrency(acc.balance * liveRate, 'MVR', hide)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant={acc.currency === 'USD' ? 'success' : 'purple'} className="text-[10px]">
                    {acc.currency}
                  </Badge>
                  <Badge variant="default" className="text-[10px] hidden xs:inline-flex">{acc.type.replace('_', ' ')}</Badge>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Account Detail Panel: Balance History Chart + Recent Activity */}
      {selectedAccount && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 pt-2">
          <Card className="lg:col-span-7 min-w-0">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap sm:flex-nowrap">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-semibold text-white">
                    {selectedAccount.name} — 6-Month Balance History
                  </h3>
                  {selectedAccount.isDefault && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-400/10 text-amber-300 border border-amber-400/20">
                      <Star className="w-2.5 h-2.5 fill-amber-300 text-amber-300" /> Default
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {selectedAccount.institution || 'Standard'} • Trajectory & trend
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!selectedAccount.isDefault && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-xs h-7 px-2.5 text-amber-300 hover:bg-amber-400/10 border-amber-400/30"
                    onClick={() => handleSetDefaultAccount(selectedAccount.id, selectedAccount.name)}
                  >
                    <Star className="w-3 h-3 mr-1" /> Set as Default
                  </Button>
                )}
                <Badge variant="purple">{selectedAccount.currency}</Badge>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={selectedAccount.balanceHistory || []}>
                  <defs>
                    <linearGradient id="accHistoryGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor={selectedAccount.color || '#6366F1'}
                        stopOpacity={0.25}
                      />
                      <stop
                        offset="95%"
                        stopColor={selectedAccount.color || '#6366F1'}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="month" stroke="#71717A" fontSize={11} axisLine={false} tickLine={false} />
                  <YAxis stroke="#71717A" fontSize={11} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(val: any) => formatCurrency(Number(val) || 0, selectedAccount.currency, hide)}
                    contentStyle={{
                      backgroundColor: '#111218',
                      borderColor: 'rgba(255,255,255,0.08)',
                      borderRadius: '10px',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke={selectedAccount.color || '#6366F1'}
                    strokeWidth={2}
                    fill="url(#accHistoryGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="lg:col-span-5 flex flex-col justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-white mb-0.5">
                Recent Activity in {selectedAccount.name}
              </h3>
              <p className="text-xs text-zinc-400 mb-4 tabular-nums">
                In: +{formatCurrency(selectedAccount.totalIncome, selectedAccount.currency, hide)} • Out: -
                {formatCurrency(selectedAccount.totalExpenses, selectedAccount.currency, hide)}
              </p>

              <div className="divide-y divide-white/[0.04] max-h-64 overflow-y-auto pr-1">
                {(selectedAccount.transactions || []).slice(0, 8).map((tx: Transaction) => (
                  <div
                    key={tx.id}
                    className="py-2.5 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-xs font-medium text-white">{tx.payee}</p>
                      <p className="text-[11px] text-zinc-500 tabular-nums">
                        {formatDate(tx.date, user?.dateFormat)}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold tabular-nums ${
                        tx.type === 'INCOME' ? 'text-emerald-400' : 'text-white'
                      }`}
                    >
                      {tx.type === 'INCOME' ? '+' : '-'}
                      {formatCurrency(tx.amount, tx.currency || selectedAccount.currency, hide)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Add / Edit Account Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingAccount ? 'Edit Account' : 'Add Financial Account'}
      >
        <form onSubmit={handleSaveAccount} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Account Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. BML USD Account"
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Account Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#181C2C] border border-white/[0.1] text-xs text-white"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Account Currency</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#181C2C] border border-white/[0.1] text-xs font-bold text-emerald-400"
              >
                <option value="MVR">MVR (Base)</option>
                <option value="USD">USD ($ Secondary)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Current Balance</label>
              <input
                type="number"
                step="0.01"
                required
                value={form.balance}
                onChange={(e) => setForm({ ...form, balance: e.target.value })}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Institution Name</label>
              <input
                type="text"
                value={form.institution}
                onChange={(e) => setForm({ ...form, institution: e.target.value })}
                placeholder="e.g. Bank of Maldives"
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Last 4 Digits</label>
              <input
                type="text"
                maxLength={4}
                value={form.lastFour}
                onChange={(e) => setForm({ ...form, lastFour: e.target.value })}
                placeholder="4829"
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Accent Color</label>
              <div className="flex items-center gap-2 pt-1">
                {COLOR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className={`w-6 h-6 rounded-full border-2 ${
                      form.color === c ? 'border-white scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 pt-2 pb-1 px-1">
            <input
              type="checkbox"
              id="isDefaultAccount"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              className="w-4 h-4 rounded bg-white/[0.04] border-white/[0.1] text-violet-500 focus:ring-violet-500 cursor-pointer accent-violet-600"
            />
            <label htmlFor="isDefaultAccount" className="text-xs text-slate-300 cursor-pointer flex items-center gap-1.5 select-none">
              <span className="font-medium text-white">Set as primary default account</span>
              <span className="text-[11px] text-slate-400 hidden sm:inline">(Auto-selected in transactions & Telegram)</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{editingAccount ? 'Update Account' : 'Create Account'}</Button>
          </div>
        </form>
      </Modal>

      {/* Transfer Between Accounts Modal */}
      <Modal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        title="Transfer Between Accounts"
        subtitle="Instantly move funds and log a balanced transfer record"
      >
        <form onSubmit={handleTransfer} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">From Account</label>
              <select
                value={transferForm.fromAccountId}
                onChange={(e) =>
                  setTransferForm({ ...transferForm, fromAccountId: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl bg-[#181C2C] border border-white/[0.1] text-xs text-white"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (${a.balance})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">To Account</label>
              <select
                value={transferForm.toAccountId}
                onChange={(e) =>
                  setTransferForm({ ...transferForm, toAccountId: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl bg-[#181C2C] border border-white/[0.1] text-xs text-white"
              >
                {accounts
                  .filter((a) => a.id !== transferForm.fromAccountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (${a.balance})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">Transfer Amount</label>
            <input
              type="number"
              step="0.01"
              required
              value={transferForm.amount}
              onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
              placeholder="0.00"
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setTransferModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Complete Transfer</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Account"
        message={`Are you sure you want to delete "${deleteTarget?.name}" and its associated history?`}
      />
    </div>
  );
}
