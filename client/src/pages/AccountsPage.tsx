import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  CheckCircle2,
  Eye,
  EyeOff,
  Copy,
  ShieldAlert,
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
import api, { Account, Transaction, getStepUpToken } from '../services/api';
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
import { StepUpModal } from '../components/StepUpModal';
import { AccountLogo, BANK_PRESETS, detectBankLogo } from '../components/AccountLogo';
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
  const [summary, setSummary] = useState<{
    totalBalance: number;
    totalAssets: number;
    totalLiabilities: number;
    usdToMvrRate?: number;
  }>({ totalBalance: 0, totalAssets: 0, totalLiabilities: 0 });
  const [selectedAccount, setSelectedAccount] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountFilter, setAccountFilter] = useState<'ALL' | 'ASSETS' | 'LIABILITIES'>('ALL');

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

  // Decrypted Account Identifiers (Step-Up Authenticated)
  const [revealedAccounts, setRevealedAccounts] = useState<Record<string, string>>({});
  const [revealingAccountId, setRevealingAccountId] = useState<string | null>(null);

  // Step-Up Modal State
  const [stepUpModalOpen, setStepUpModalOpen] = useState(false);
  const [stepUpDescription, setStepUpDescription] = useState('');
  const [stepUpAction, setStepUpAction] = useState<((token: string) => Promise<void> | void) | null>(null);

  const executeWithStepUp = (description: string, action: (token: string) => Promise<void> | void) => {
    const existing = getStepUpToken();
    if (existing) {
      action(existing);
    } else {
      setStepUpDescription(description);
      setStepUpAction(() => action);
      setStepUpModalOpen(true);
    }
  };

  const handleRevealAccountNumber = (accId: string, accName: string) => {
    executeWithStepUp(
      `Confirm your account password to decrypt and view the full bank account number for "${accName}".`,
      async () => {
        setRevealingAccountId(accId);
        try {
          const { data } = await api.post(`/accounts/${accId}/reveal-number`);
          if (data.success && data.accountNumber) {
            setRevealedAccounts((prev) => ({ ...prev, [accId]: data.accountNumber }));
            addToast(`Account identifier revealed for "${accName}".`, 'info');
          }
        } catch (err: any) {
          addToast(err.response?.data?.message || 'Failed to reveal account number.', 'error');
        } finally {
          setRevealingAccountId(null);
        }
      }
    );
  };

  const handleHideAccountNumber = (accId: string) => {
    setRevealedAccounts((prev) => {
      const copy = { ...prev };
      delete copy[accId];
      return copy;
    });
  };

  const handleCopyAccountNumber = (num: string) => {
    navigator.clipboard.writeText(num);
    addToast('Account number copied to clipboard!', 'success');
  };

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
    const detected = detectBankLogo({ name: acc.name, institution: acc.institution, icon: acc.icon });
    const matchedPreset = BANK_PRESETS.find((p) => p.id === detected);
    setForm({
      name: acc.name,
      type: acc.type,
      balance: String(Number((Number(acc.balance) || 0).toFixed(2))),
      currency: acc.currency === 'USD' ? 'USD' : 'MVR',
      color: acc.color || matchedPreset?.color || '#8B5CF6',
      icon: acc.icon && acc.icon !== 'landmark' ? acc.icon : (detected !== 'landmark' ? detected : 'landmark'),
      institution: acc.institution || matchedPreset?.institution || '',
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
      const trimmed = form.lastFour.trim();
      const payload: any = {
        ...form,
        balance: parseFloat(form.balance || '0'),
        accountNumber: trimmed.length > 4 ? trimmed : undefined,
        lastFour: trimmed.length <= 4 ? (trimmed || undefined) : trimmed.slice(-4),
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
    executeWithStepUp(
      `Confirm your account password to permanently delete "${deleteTarget.name}". This will remove all associated transactions.`,
      async () => {
        try {
          await api.delete(`/accounts/${deleteTarget.id}`);
          addToast('Account deleted.', 'info');
          setDeleteTarget(null);
          setSelectedAccount(null);
          triggerDataRefresh();
        } catch (err: any) {
          addToast(err.response?.data?.message || 'Failed to delete account.', 'error');
        }
      }
    );
  };

  const currency = 'MVR';
  const liveRate = Number(summary.usdToMvrRate || user?.usdToMvrRate || 15.42);
  const hide = user?.hideBalances;

  const assetAccounts = useMemo(
    () => accounts.filter((a) => ['CHECKING', 'SAVINGS', 'INVESTMENT', 'CASH'].includes(a.type) || a.balance >= 0),
    [accounts]
  );

  const liabilityAccounts = useMemo(
    () => accounts.filter((a) => ['CREDIT_CARD', 'LOAN'].includes(a.type) || a.balance < 0),
    [accounts]
  );

  const filteredAccounts = useMemo(() => {
    if (accountFilter === 'ASSETS') return assetAccounts;
    if (accountFilter === 'LIABILITIES') return liabilityAccounts;
    return accounts;
  }, [accounts, accountFilter, assetAccounts, liabilityAccounts]);

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
        <SkeletonMetric count={3} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} className="h-48 flex flex-col justify-between" />
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
            <Landmark className="w-5 h-5 text-indigo-400" />
            Accounts &amp; Institutions
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Manage MVR &amp; USD accounts, track cash reserves, and monitor bank liquidity.
          </p>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
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
            className="w-full sm:w-auto"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-400" /> Transfer Funds
          </Button>
          <Button size="sm" onClick={openAddModal} className="w-full sm:w-auto">
            <Plus className="w-3.5 h-3.5" /> Add Account
          </Button>
        </div>
      </div>

      {/* Summary KPI Cockpit */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
        {/* Net Combined Balance - Hero Card */}
        <Card className="p-5 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-[#121422] to-[#0f1019] border-indigo-500/30 shadow-lg shadow-indigo-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300/90">
              Net Combined Balance
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white font-display tabular-nums tracking-tight truncate">
              {formatCurrency(summary.totalBalance, currency, hide)}
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-xs font-semibold text-emerald-400 tabular-nums">
                ≈ {formatSecondaryUSD(summary.totalBalance, liveRate, hide)} USD
              </span>
              <span className="text-[11px] text-zinc-500">
                @ MVR {liveRate.toFixed(2)}
              </span>
            </div>
          </div>
        </Card>

        {/* Total Assets */}
        <Card className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Total Liquid Assets</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-xl sm:text-2xl font-bold text-emerald-400 font-display tabular-nums tracking-tight truncate">
              {formatCurrency(summary.totalAssets, currency, hide)}
            </p>
            <p className="text-xs text-zinc-500 tabular-nums mt-1">
              ≈ {formatSecondaryUSD(summary.totalAssets, liveRate, hide)} USD ({assetAccounts.length} accounts)
            </p>
          </div>
        </Card>

        {/* Total Liabilities */}
        <Card className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Total Liabilities &amp; Cards</span>
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-xl sm:text-2xl font-bold text-rose-400 font-display tabular-nums tracking-tight truncate">
              {formatCurrency(summary.totalLiabilities, currency, hide)}
            </p>
            <p className="text-xs text-zinc-500 tabular-nums mt-1">
              ≈ {formatSecondaryUSD(summary.totalLiabilities, liveRate, hide)} USD ({liabilityAccounts.length} commitments)
            </p>
          </div>
        </Card>
      </div>

      {/* Segmented Filter Pills */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="inline-flex p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] gap-1 overflow-x-auto no-scrollbar">
          {[
            { id: 'ALL', label: `All Accounts (${accounts.length})` },
            { id: 'ASSETS', label: `Assets (${assetAccounts.length})` },
            { id: 'LIABILITIES', label: `Liabilities (${liabilityAccounts.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setAccountFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 whitespace-nowrap cursor-pointer ${
                accountFilter === tab.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-zinc-500 hidden sm:inline">
          Click an account to inspect 6-month history
        </span>
      </div>

      {/* Accounts Grid */}
      {filteredAccounts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No accounts found in this category"
          description="Create a new account or change your active filter to view accounts."
          action={
            <Button size="sm" onClick={openAddModal}>
              <Plus className="w-3.5 h-3.5" /> Add Account
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {filteredAccounts.map((acc) => {
            const isSelected = selectedAccount?.id === acc.id;
            const isNegative = acc.balance < 0;

            return (
              <div
                key={acc.id}
                onClick={() => handleSelectAccount(acc.id)}
                className={`faisaa-card finora-card rounded-2xl p-4 sm:p-5 border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                  isSelected
                    ? 'bg-[#141624] border-indigo-500/70 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/40'
                    : 'bg-[#111218] border-white/[0.06] hover:border-white/[0.14] hover:bg-[#14151e]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <AccountLogo account={acc} size="lg" className="transition-transform group-hover:scale-105" />
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
                          {acc.institution || acc.type.replace('_', ' ')}{' '}
                          {acc.lastFour
                            ? revealedAccounts[acc.id]
                              ? revealedAccounts[acc.id]
                              : `•••• ${acc.lastFour}`
                            : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {!acc.isDefault && (
                        <button
                          onClick={() => handleSetDefaultAccount(acc.id, acc.name)}
                          title="Set as default account"
                          className="p-1.5 sm:p-2 rounded-lg text-zinc-400 hover:text-amber-300 hover:bg-amber-400/10 cursor-pointer transition-colors"
                        >
                          <Star className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => openEditModal(acc)}
                        title="Edit account"
                        className="p-1.5 sm:p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] cursor-pointer transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(acc)}
                        title="Delete account"
                        className="p-1.5 sm:p-2 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Dominant Balance Section */}
                  <div className="mt-4 pt-3 border-t border-white/[0.04]">
                    <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider block">
                      Balance ({acc.currency})
                    </span>
                    <p
                      className={`text-2xl sm:text-3xl font-bold mt-1 font-display tabular-nums tracking-tight truncate ${
                        isNegative ? 'text-rose-400' : 'text-white'
                      }`}
                    >
                      {formatCurrency(acc.balance, acc.currency, hide)}
                    </p>
                    {acc.currency === 'USD' ? (
                      <p className="text-xs font-semibold text-emerald-400 mt-1 tabular-nums truncate">
                        ≈ {formatCurrency(acc.balance * liveRate, 'MVR', hide)}
                      </p>
                    ) : (
                      <p className="text-xs font-normal text-zinc-500 mt-1 tabular-nums truncate">
                        ≈ {formatSecondaryUSD(acc.balance, liveRate, hide)} USD
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Badge variant={acc.currency === 'USD' ? 'success' : 'purple'} className="text-[10px]">
                      {acc.currency}
                    </Badge>
                    <Badge variant="default" className="text-[10px] hidden xs:inline-flex">
                      {acc.type.replace('_', ' ')}
                    </Badge>
                  </div>
                  {isSelected && (
                    <span className="text-[11px] font-medium text-indigo-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Active View
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected Account Detail Panel: Balance History Chart + Recent Activity */}
      {selectedAccount && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 pt-2">
          {/* 6-Month Balance History AreaChart */}
          <Card className="lg:col-span-7 min-w-0">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-3 min-w-0">
                <AccountLogo account={selectedAccount} size="lg" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-semibold text-white">
                      {selectedAccount.name} — 6-Month History
                    </h3>
                    {selectedAccount.isDefault && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-400/10 text-amber-300 border border-amber-400/20">
                        <Star className="w-2.5 h-2.5 fill-amber-300 text-amber-300" /> Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {selectedAccount.institution || 'Standard Account'} • Historical trajectory &amp; balance changes
                  </p>
                  {selectedAccount.lastFour && (
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs">
                        <CreditCard className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="font-mono text-zinc-200 tracking-wider">
                          {revealedAccounts[selectedAccount.id] || `•••• •••• •••• ${selectedAccount.lastFour}`}
                        </span>
                        {revealedAccounts[selectedAccount.id] ? (
                          <div className="flex items-center gap-1 ml-1.5">
                            <button
                              type="button"
                              onClick={() => handleCopyAccountNumber(revealedAccounts[selectedAccount.id])}
                              title="Copy full account number"
                              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleHideAccountNumber(selectedAccount.id)}
                              title="Hide account number"
                              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                            >
                              <EyeOff className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={revealingAccountId === selectedAccount.id}
                            onClick={() => handleRevealAccountNumber(selectedAccount.id, selectedAccount.name)}
                            title="Decrypt and reveal full account number"
                            className="ml-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Eye className="w-3 h-3" />
                            <span>{revealingAccountId === selectedAccount.id ? 'Decrypting...' : 'Reveal Number'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!selectedAccount.isDefault && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-xs h-7 px-2.5 text-amber-300 hover:bg-amber-400/10 border-amber-400/30"
                    onClick={() => handleSetDefaultAccount(selectedAccount.id, selectedAccount.name)}
                  >
                    <Star className="w-3 h-3 mr-1" /> Set Default
                  </Button>
                )}
                <Badge variant={selectedAccount.currency === 'USD' ? 'success' : 'purple'}>
                  {selectedAccount.currency}
                </Badge>
              </div>
            </div>

            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={selectedAccount.balanceHistory || []}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="accHistoryGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor={selectedAccount.color || '#6366F1'}
                        stopOpacity={0.2}
                      />
                      <stop
                        offset="95%"
                        stopColor={selectedAccount.color || '#6366F1'}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    stroke="#71717A"
                    fontSize={11}
                    axisLine={false}
                    tickLine={false}
                    dy={6}
                  />
                  <YAxis
                    stroke="#71717A"
                    fontSize={11}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                  />
                  <Tooltip
                    formatter={(val: any) => [
                      formatCurrency(Number(val) || 0, selectedAccount.currency, hide),
                      'Balance',
                    ]}
                    contentStyle={{
                      backgroundColor: '#111218',
                      borderColor: 'rgba(255,255,255,0.08)',
                      borderRadius: '12px',
                      fontSize: '12px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
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

          {/* Recent Activity in Selected Account */}
          <Card className="lg:col-span-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <h3 className="text-sm sm:text-base font-semibold text-white">
                  Recent Activity
                </h3>
                <span className="text-xs text-zinc-400 truncate max-w-[150px]">
                  {selectedAccount.name}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mb-4 tabular-nums">
                In: <span className="text-emerald-400 font-semibold">+{formatCurrency(selectedAccount.totalIncome, selectedAccount.currency, hide)}</span> • Out:{' '}
                <span className="text-rose-400 font-semibold">-{formatCurrency(selectedAccount.totalExpenses, selectedAccount.currency, hide)}</span>
              </p>

              {(!selectedAccount.transactions || selectedAccount.transactions.length === 0) ? (
                <div className="py-12 text-center text-xs text-zinc-500">
                  No transactions logged for this account yet.
                </div>
              ) : (
                <div className="divide-y divide-white/[0.04] max-h-72 overflow-y-auto pr-1">
                  {(selectedAccount.transactions || []).slice(0, 8).map((tx: Transaction) => (
                    <div
                      key={tx.id}
                      className="py-2.5 flex items-center justify-between gap-3 hover:bg-white/[0.02] px-1 rounded-lg transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-white truncate">{tx.payee}</p>
                        <p className="text-[11px] text-zinc-500 tabular-nums">
                          {formatDate(tx.date, user?.dateFormat)}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold tabular-nums shrink-0 ${
                          tx.type === 'INCOME' ? 'text-emerald-400' : 'text-white'
                        }`}
                      >
                        {tx.type === 'INCOME' ? '+' : '-'}
                        {formatCurrency(tx.amount, tx.currency || selectedAccount.currency, hide)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Add / Edit Account Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingAccount ? 'Edit Account' : 'Add Financial Account'}
        subtitle="Configure institution, initial balance, and base currency"
      >
        <form onSubmit={handleSaveAccount} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Account Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. BML Salary Account"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Account Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#141620] border border-white/[0.08] text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Currency</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#141620] border border-white/[0.08] text-xs sm:text-sm font-semibold text-emerald-400 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors"
              >
                <option value="MVR">MVR (Base)</option>
                <option value="USD">USD ($ Secondary)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Current Balance</label>
              <input
                type="number"
                step="0.01"
                required
                value={form.balance}
                onChange={(e) => setForm({ ...form, balance: e.target.value })}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#141620] border border-white/[0.08] text-xs sm:text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Institution Name</label>
              <input
                type="text"
                value={form.institution}
                onChange={(e) => setForm({ ...form, institution: e.target.value })}
                placeholder="e.g. Bank of Maldives"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#141620] border border-white/[0.08] text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors"
              />
            </div>
          </div>

          {/* Institution & Bank Logo Selection (Bitwarden-style) */}
          <div className="space-y-2 p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                <span>Account Logo</span>
                <span className="text-[11px] font-normal text-zinc-400">
                  (Choose preset or auto-detect from bank name)
                </span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-400">Preview:</span>
                <div className="p-1 rounded-xl bg-white/[0.04] border border-white/[0.08] shadow-xs flex items-center justify-center">
                  <AccountLogo
                    name={form.name}
                    institution={form.institution}
                    icon={form.icon}
                    color={form.color}
                    size="sm"
                  />
                </div>
              </div>
            </div>

            {/* Presets Grid */}
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {BANK_PRESETS.map((p) => {
                const detected = detectBankLogo({ name: form.name, institution: form.institution, icon: form.icon });
                const isSelected =
                  form.icon === p.id ||
                  (form.icon === 'landmark' && detected === p.id) ||
                  (!form.icon && detected === p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setForm({
                        ...form,
                        icon: p.id,
                        institution: form.institution || p.institution,
                        color: p.color,
                        currency: form.currency || p.defaultCurrency,
                      });
                    }}
                    className={`p-2.5 rounded-xl flex flex-col items-center gap-1.5 transition-all border cursor-pointer ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-500/15 shadow-xs ring-1 ring-indigo-500/30'
                        : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06]'
                    }`}
                  >
                    <AccountLogo icon={p.id} size="sm" />
                    <span className="text-[10px] font-semibold text-zinc-300 truncate w-full text-center">
                      {p.id.toUpperCase()}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Custom Logo URL / Reset */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={
                  form.icon.startsWith('http') || form.icon.startsWith('data:')
                    ? form.icon
                    : ''
                }
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                placeholder="Or paste custom logo URL (https://...)"
                className="flex-1 px-3 py-2 rounded-xl bg-[#141622] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/60 transition-colors"
              />
              {form.icon && form.icon !== 'landmark' && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, icon: 'landmark' })}
                  className="px-2.5 py-2 rounded-xl text-xs text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors cursor-pointer"
                >
                  Auto-Detect
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Last 4 Digits</label>
              <input
                type="text"
                maxLength={4}
                value={form.lastFour}
                onChange={(e) => setForm({ ...form, lastFour: e.target.value })}
                placeholder="4829"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Accent Color</label>
              <div className="flex items-center gap-2 pt-1.5">
                {COLOR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                      form.color === c ? 'border-white scale-110 shadow-sm' : 'border-transparent opacity-80 hover:opacity-100'
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
              className="w-4 h-4 rounded bg-white/[0.04] border-white/[0.1] text-indigo-500 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
            />
            <label htmlFor="isDefaultAccount" className="text-xs text-zinc-300 cursor-pointer flex items-center gap-1.5 select-none">
              <span className="font-medium text-white">Set as primary default account</span>
              <span className="text-[11px] text-zinc-400 hidden sm:inline">(Auto-selected in transactions & Telegram)</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/[0.06]">
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
        subtitle="Instantly move funds and record balanced double-entry transfer"
      >
        <form onSubmit={handleTransfer} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-zinc-300">From Account</label>
                {accounts.find((a) => a.id === transferForm.fromAccountId) && (
                  <AccountLogo
                    account={accounts.find((a) => a.id === transferForm.fromAccountId)}
                    size="xs"
                  />
                )}
              </div>
              <select
                value={transferForm.fromAccountId}
                onChange={(e) =>
                  setTransferForm({ ...transferForm, fromAccountId: e.target.value })
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#141620] border border-white/[0.08] text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency} {a.balance.toFixed(2)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-zinc-300">To Account</label>
                {accounts.find((a) => a.id === transferForm.toAccountId) && (
                  <AccountLogo
                    account={accounts.find((a) => a.id === transferForm.toAccountId)}
                    size="xs"
                  />
                )}
              </div>
              <select
                value={transferForm.toAccountId}
                onChange={(e) =>
                  setTransferForm({ ...transferForm, toAccountId: e.target.value })
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#141620] border border-white/[0.08] text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors"
              >
                {accounts
                  .filter((a) => a.id !== transferForm.fromAccountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency} {a.balance.toFixed(2)})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">Transfer Amount</label>
            <input
              type="number"
              step="0.01"
              required
              value={transferForm.amount}
              onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
              placeholder="0.00"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">Description (Optional)</label>
            <input
              type="text"
              value={transferForm.description}
              onChange={(e) => setTransferForm({ ...transferForm, description: e.target.value })}
              placeholder="e.g. Card settlement or savings transfer"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/[0.06]">
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

      <StepUpModal
        isOpen={stepUpModalOpen}
        onClose={() => {
          setStepUpModalOpen(false);
          setStepUpAction(null);
        }}
        description={stepUpDescription}
        onSuccess={async (token) => {
          if (stepUpAction) {
            await stepUpAction(token);
          }
        }}
      />
    </div>
  );
}
