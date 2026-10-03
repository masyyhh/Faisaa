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
    return <LoadingState label="Loading your financial accounts..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
            Accounts & Institutions (MVR & USD)
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Manage MVR & USD ($) accounts and convert currencies at live exchange rates ($1 = MVR {liveRate.toFixed(2)}).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={openExchangeModal}
            className="text-xs"
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
            className="text-xs"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-violet-400" /> Transfer Funds
          </Button>
          <Button size="sm" onClick={openAddModal} className="text-xs">
            <Plus className="w-3.5 h-3.5" /> Add Account
          </Button>
        </div>
      </div>

      {/* Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
        <Card className="p-3.5 sm:p-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] sm:text-xs uppercase tracking-wider text-slate-400">Total Assets (MVR)</p>
            <p className="text-xl sm:text-2xl font-extrabold text-emerald-400 mt-1 truncate">
              {formatCurrency(summary.totalAssets, currency, hide)}
            </p>
            <p className="text-[11px] sm:text-xs font-semibold text-slate-400 mt-0.5">
              {formatSecondaryUSD(summary.totalAssets, liveRate, hide)} USD
            </p>
          </div>
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
            <Landmark className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-3.5 sm:p-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] sm:text-xs uppercase tracking-wider text-slate-400">Total Liabilities (MVR)</p>
            <p className="text-xl sm:text-2xl font-extrabold text-rose-400 mt-1 truncate">
              {formatCurrency(summary.totalLiabilities, currency, hide)}
            </p>
            <p className="text-[11px] sm:text-xs font-semibold text-slate-400 mt-0.5">
              {formatSecondaryUSD(summary.totalLiabilities, liveRate, hide)} USD
            </p>
          </div>
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-3.5 sm:p-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] sm:text-xs uppercase tracking-wider text-slate-400">Combined Net Balance (MVR)</p>
            <p className="text-xl sm:text-2xl font-extrabold text-white mt-1 truncate">
              {formatCurrency(summary.totalBalance, currency, hide)}
            </p>
            <p className="text-[11px] sm:text-xs font-semibold text-emerald-400 mt-0.5">
              {formatSecondaryUSD(summary.totalBalance, liveRate, hide)} USD (@ {liveRate.toFixed(2)})
            </p>
          </div>
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-violet-500/15 text-violet-400 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5" />
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
                  ? 'bg-[#171B2E] border-violet-500 shadow-lg shadow-violet-500/15'
                  : 'bg-[#131622] border-white/[0.07] hover:border-white/[0.18]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${acc.color}22`, color: acc.color }}
                  >
                    <DynamicIcon name={acc.icon} className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm sm:text-base font-bold text-white truncate">{acc.name}</h3>
                      {!acc.isActive && <Badge variant="warning">Archived</Badge>}
                    </div>
                    <p className="text-xs text-slate-400 truncate">
                      {acc.institution || acc.type} {acc.lastFour ? `•••• ${acc.lastFour}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => openEditModal(acc)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.07] cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(acc)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 sm:mt-5 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-400">
                    Current Balance ({acc.currency})
                  </p>
                  <p
                    className={`text-xl sm:text-2xl font-extrabold mt-0.5 font-display truncate ${
                      acc.balance < 0 ? 'text-rose-400' : 'text-white'
                    }`}
                  >
                    {formatCurrency(acc.balance, acc.currency, hide)}
                  </p>
                  {acc.currency === 'USD' && (
                    <p className="text-[11px] sm:text-xs font-semibold text-emerald-400 mt-0.5 truncate">
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
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white">
                  {selectedAccount.name} — 6-Month Balance History
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedAccount.institution} • Account Activity & Balance Trajectory
                </p>
              </div>
              <Badge variant="purple">{selectedAccount.currency}</Badge>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={selectedAccount.balanceHistory || []}>
                  <defs>
                    <linearGradient id="accHistoryGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor={selectedAccount.color || '#8B5CF6'}
                        stopOpacity={0.4}
                      />
                      <stop
                        offset="95%"
                        stopColor={selectedAccount.color || '#8B5CF6'}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" stroke="#64748B" fontSize={12} />
                  <YAxis stroke="#64748B" fontSize={12} />
                  <Tooltip
                    formatter={(val: any) => formatCurrency(Number(val) || 0, selectedAccount.currency, hide)}
                    contentStyle={{
                      backgroundColor: '#121523',
                      borderColor: 'rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke={selectedAccount.color || '#8B5CF6'}
                    strokeWidth={2.5}
                    fill="url(#accHistoryGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="lg:col-span-5">
            <h3 className="text-base font-bold text-white mb-1">
              Recent Activity in {selectedAccount.name}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Total In: +{formatCurrency(selectedAccount.totalIncome, selectedAccount.currency, hide)} • Total Out: -
              {formatCurrency(selectedAccount.totalExpenses, selectedAccount.currency, hide)}
            </p>

            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {(selectedAccount.transactions || []).slice(0, 8).map((tx: Transaction) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]"
                >
                  <div>
                    <p className="text-xs font-semibold text-white">{tx.payee}</p>
                    <p className="text-[11px] text-slate-400">
                      {formatDate(tx.date, user?.dateFormat)}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-bold ${
                      tx.type === 'INCOME' ? 'text-emerald-400' : 'text-white'
                    }`}
                  >
                    {tx.type === 'INCOME' ? '+' : '-'}
                    {formatCurrency(tx.amount, tx.currency || selectedAccount.currency, hide)}
                  </span>
                </div>
              ))}
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
