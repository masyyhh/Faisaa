import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Coins,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Percent,
  CheckCircle2,
  TrendingDown,
  Plus,
  Trash2,
  Edit2,
  History,
  Sparkles,
  Mountain,
  Snowflake,
  ShieldAlert,
  Wallet,
  Clock,
  Landmark,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api, { Loan, LoanSummary, Account, LoansResponse } from '../services/api';
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
} from '../components/ui';
import { formatCurrency, formatSecondaryUSD, formatDate } from '../utils/formatters';
import { triggerConfetti } from '../utils/confetti';

const CATEGORIES = [
  { value: 'PERSONAL_LOAN', label: 'Personal Bank Loan' },
  { value: 'VEHICLE', label: 'Vehicle / Auto Financing' },
  { value: 'MORTGAGE', label: 'Home / Real Estate Financing' },
  { value: 'STUDENT', label: 'Student / Education Loan' },
  { value: 'CREDIT_CARD', label: 'Credit Card Balance' },
  { value: 'ISLAMIC_FINANCING', label: 'Islamic Murabaha / Financing' },
  { value: 'FRIENDS_FAMILY', label: 'Friends & Family Loan' },
  { value: 'OTHER', label: 'Other Debt / Agreement' },
];

export default function LoansPage() {
  const { user, addToast, refreshTrigger, triggerDataRefresh } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [summary, setSummary] = useState<LoanSummary>({
    totalOwedByMe: 0,
    totalOwedToMe: 0,
    netDebtBalance: 0,
    totalMonthlyCommitment: 0,
    activeDebtsCount: 0,
    activeReceivablesCount: 0,
    paidOffCount: 0,
  });
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Navigation & Strategy state
  const [activeTab, setActiveTab] = useState<'OWED_BY_ME' | 'OWED_TO_ME'>('OWED_BY_ME');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PAID_OFF'>('ALL');
  const [strategy, setStrategy] = useState<'AVALANCHE' | 'SNOWBALL'>('AVALANCHE');

  // Modals state
  const [loanModalOpen, setLoanModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [savingLoan, setSavingLoan] = useState(false);

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payingLoan, setPayingLoan] = useState<Loan | null>(null);
  const [payingAmount, setPayingAmount] = useState('');
  const [payAccountId, setPayAccountId] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState('');
  const [processingPay, setProcessingPay] = useState(false);

  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedLoanForHistory, setSelectedLoanForHistory] = useState<Loan | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Loan | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    type: 'OWED_BY_ME' as 'OWED_BY_ME' | 'OWED_TO_ME',
    category: 'PERSONAL_LOAN',
    lender: '',
    originalAmount: '',
    remainingBalance: '',
    interestRate: '0',
    minimumPayment: '',
    currency: 'MVR',
    dueDate: '',
    dueDay: '1',
    accountId: '',
    color: '#6366F1',
    notes: '',
  });

  const currency = user?.currency || 'MVR';
  const liveRate = user?.usdToMvrRate || 18.45;
  const hide = user?.hideBalances;

  const loadData = useCallback(async () => {
    try {
      const [loansRes, accRes] = await Promise.all([
        api.get<LoansResponse>('/loans'),
        api.get('/accounts'),
      ]);

      if (loansRes.data.success) {
        setLoans(loansRes.data.loans || []);
        if (loansRes.data.summary) {
          setSummary(loansRes.data.summary);
        }
      }
      if (accRes.data.success) {
        setAccounts(accRes.data.accounts || []);
      }
    } catch {
      addToast('Failed to load loans and debt data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTrigger]);

  const handleOpenCreateModal = (presetType?: 'OWED_BY_ME' | 'OWED_TO_ME') => {
    setEditingLoan(null);
    setFormData({
      name: '',
      type: presetType || activeTab,
      category: 'PERSONAL_LOAN',
      lender: '',
      originalAmount: '',
      remainingBalance: '',
      interestRate: '0',
      minimumPayment: '',
      currency: 'MVR',
      dueDate: '',
      dueDay: '1',
      accountId: accounts.find((a) => a.isDefault)?.id || accounts[0]?.id || '',
      color: presetType === 'OWED_TO_ME' ? '#10B981' : '#6366F1',
      notes: '',
    });
    setLoanModalOpen(true);
  };

  const handleOpenEditModal = (loan: Loan) => {
    setEditingLoan(loan);
    setFormData({
      name: loan.name,
      type: loan.type,
      category: loan.category,
      lender: loan.lender || '',
      originalAmount: String(loan.originalAmount),
      remainingBalance: String(loan.remainingBalance),
      interestRate: String(loan.interestRate || 0),
      minimumPayment: String(loan.minimumPayment || 0),
      currency: loan.currency || 'MVR',
      dueDate: loan.dueDate ? new Date(loan.dueDate).toISOString().split('T')[0] : '',
      dueDay: String(loan.dueDay || 1),
      accountId: loan.accountId || '',
      color: loan.color || '#6366F1',
      notes: loan.notes || '',
    });
    setLoanModalOpen(true);
  };

  const handleSaveLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLoan(true);

    try {
      const orig = parseFloat(formData.originalAmount);
      if (isNaN(orig) || orig <= 0) {
        addToast('Please enter a valid loan amount greater than 0.', 'error');
        setSavingLoan(false);
        return;
      }
      const rem = formData.remainingBalance !== '' ? parseFloat(formData.remainingBalance) : orig;
      if (isNaN(rem) || rem < 0) {
        addToast('Remaining balance cannot be negative.', 'error');
        setSavingLoan(false);
        return;
      }

      const payload = {
        name: formData.name.trim(),
        type: formData.type,
        category: formData.category,
        lender: formData.lender.trim() || null,
        originalAmount: orig,
        remainingBalance: rem,
        interestRate: parseFloat(formData.interestRate) || 0,
        minimumPayment: parseFloat(formData.minimumPayment) || 0,
        currency: formData.currency,
        dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : null,
        dueDay: parseInt(formData.dueDay, 10) || 1,
        accountId: formData.accountId || null,
        color: formData.color,
        notes: formData.notes.trim() || null,
      };

      if (editingLoan) {
        await api.put(`/loans/${editingLoan.id}`, payload);
        addToast('Loan details updated!', 'success');
      } else {
        await api.post('/loans', payload);
        addToast(
          formData.type === 'OWED_BY_ME'
            ? 'New loan / debt added to tracker!'
            : 'New IOU / receivable added to tracker!',
          'success'
        );
      }

      setLoanModalOpen(false);
      loadData();
      triggerDataRefresh();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to save loan.', 'error');
    } finally {
      setSavingLoan(false);
    }
  };

  const handleOpenPayModal = (loan: Loan) => {
    setPayingLoan(loan);
    setPayingAmount(String(loan.minimumPayment > 0 ? loan.minimumPayment : loan.remainingBalance));
    setPayAccountId(loan.accountId || accounts.find((a) => a.isDefault)?.id || accounts[0]?.id || '');
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayNotes('');
    setPayModalOpen(true);
  };

  const handleExecutePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingLoan) return;

    setProcessingPay(true);
    try {
      const amt = parseFloat(payingAmount);
      if (isNaN(amt) || amt <= 0) {
        addToast('Please enter a valid payment amount greater than 0.', 'error');
        setProcessingPay(false);
        return;
      }
      const res = await api.post(`/loans/${payingLoan.id}/pay`, {
        amount: amt,
        accountId: payAccountId || undefined,
        date: new Date(payDate).toISOString(),
        notes: payNotes.trim() || undefined,
      });

      if (res.data.isPaidOff) {
        triggerConfetti();
        addToast(`🎉 Huge Milestone! ${payingLoan.name} is now 100% PAID OFF!`, 'success');
      } else {
        addToast(
          payingLoan.type === 'OWED_BY_ME'
            ? `Logged installment payment of ${formatCurrency(amt, payingLoan.currency)}!`
            : `Logged repayment of ${formatCurrency(amt, payingLoan.currency)} received!`,
          'success'
        );
      }

      setPayModalOpen(false);
      loadData();
      triggerDataRefresh();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Payment processing failed.', 'error');
    } finally {
      setProcessingPay(false);
    }
  };

  const handleDeleteLoan = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/loans/${deleteTarget.id}`);
      addToast('Loan and payment history deleted.', 'info');
      setDeleteTarget(null);
      loadData();
      triggerDataRefresh();
    } catch {
      addToast('Failed to delete loan.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Filtered loans
  const currentTabLoans = useMemo(() => {
    return loans.filter((l) => {
      if (l.type !== activeTab) return false;
      if (statusFilter === 'ACTIVE') return l.status === 'ACTIVE';
      if (statusFilter === 'PAID_OFF') return l.status === 'PAID_OFF';
      return true;
    });
  }, [loans, activeTab, statusFilter]);

  // Strategy sorting for debts I owe
  const strategyRankedDebts = useMemo(() => {
    const activeDebts = loans.filter((l) => l.type === 'OWED_BY_ME' && l.status === 'ACTIVE');
    if (strategy === 'AVALANCHE') {
      // Highest interest rate first
      return [...activeDebts].sort((a, b) => b.interestRate - a.interestRate || a.remainingBalance - b.remainingBalance);
    } else {
      // Snowball: Smallest balance first
      return [...activeDebts].sort((a, b) => a.remainingBalance - b.remainingBalance);
    }
  }, [loans, strategy]);

  const topPriorityDebt = strategyRankedDebts[0];

  // Overall Payoff Progress Percentage
  const overallPayoffPct = useMemo(() => {
    const owedDebts = loans.filter((l) => l.type === 'OWED_BY_ME');
    const totalOrig = owedDebts.reduce((s, l) => s + l.originalAmount, 0);
    const totalRem = owedDebts.reduce((s, l) => s + l.remainingBalance, 0);
    if (totalOrig <= 0) return 0;
    return Math.min(100, Math.max(0, ((totalOrig - totalRem) / totalOrig) * 100));
  }, [loans]);

  if (loading && loans.length === 0) {
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
            <SkeletonCard key={i} className="h-56 flex flex-col justify-between" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white font-display tracking-tight flex items-center gap-2">
            <Coins className="w-5 h-5 text-indigo-400" />
            Loans & Debt Tracker
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Track bank loans, Islamic financing, IOUs, and accelerate payoff using Snowball &amp; Avalanche strategies.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => handleOpenCreateModal()} size="sm">
            <Plus className="w-3.5 h-3.5" /> Add Debt or Loan
          </Button>
        </div>
      </div>

      {/* Summary KPI Cockpit */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        <Card className="space-y-2 p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>Total Debts I Owe</span>
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <ArrowDownLeft className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-bold text-white font-display tabular-nums">
            {hide ? '••••••' : formatCurrency(summary.totalOwedByMe, currency)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-0.5">
            <span>Installments:</span>
            <span className="font-semibold text-rose-400">
              {hide ? '••••' : formatCurrency(summary.totalMonthlyCommitment, currency)}/mo
            </span>
          </div>
        </Card>

        <Card className="space-y-2 p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>Receivables (IOUs)</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-bold text-white font-display tabular-nums">
            {hide ? '••••••' : formatCurrency(summary.totalOwedToMe, currency)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-0.5">
            <span>People:</span>
            <span className="font-semibold text-emerald-400">{summary.activeReceivablesCount} active</span>
          </div>
        </Card>

        <Card className="space-y-2 p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>Net Position</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <TrendingDown className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className={`text-lg sm:text-xl font-bold font-display tabular-nums ${summary.netDebtBalance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {hide ? '••••••' : formatCurrency(Math.abs(summary.netDebtBalance), currency)}
          </div>
          <div className="text-[11px] text-zinc-500 pt-0.5">
            {summary.netDebtBalance > 0 ? 'Net Liability Owed' : 'Net Surplus Receivable'}
          </div>
        </Card>

        <Card className="space-y-2 p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>Payoff Progress</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-bold text-white font-display tabular-nums">
            {overallPayoffPct.toFixed(1)}%
          </div>
          <ProgressBar value={overallPayoffPct} color="#6366F1" height="h-1.5" />
          <div className="text-[11px] text-zinc-500 pt-0.5">
            {summary.paidOffCount} settled
          </div>
        </Card>
      </div>

      {/* Payoff Strategy Accelerator Banner (For Debts I Owe) */}
      {topPriorityDebt && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-[#12141c] border border-indigo-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-1">
                {strategy === 'AVALANCHE' ? <Mountain className="w-3 h-3" /> : <Snowflake className="w-3 h-3" />}
                {strategy === 'AVALANCHE' ? 'Debt Avalanche Strategy' : 'Debt Snowball Strategy'}
              </span>
              <span className="text-xs text-amber-300 font-medium">
                🎯 #1 Focus Priority
              </span>
            </div>

            <h3 className="text-base font-bold text-white">
              Accelerate Payoff on <span className="text-indigo-300">{topPriorityDebt.name}</span>
            </h3>

            <p className="text-xs text-slate-300 leading-relaxed">
              {strategy === 'AVALANCHE' ? (
                <>
                  With an annual rate of <strong className="text-white">{topPriorityDebt.interestRate}%</strong>, paying this off first mathematically minimizes your total financing costs. Remaining balance: <strong className="text-white">{formatCurrency(topPriorityDebt.remainingBalance, topPriorityDebt.currency)}</strong>.
                </>
              ) : (
                <>
                  With the smallest remaining balance of <strong className="text-white">{formatCurrency(topPriorityDebt.remainingBalance, topPriorityDebt.currency)}</strong>, eliminating this gives you the quickest psychological momentum win!
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="flex items-center rounded-xl bg-white/[0.05] p-1 border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setStrategy('AVALANCHE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  strategy === 'AVALANCHE'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Avalanche (High Interest)
              </button>
              <button
                type="button"
                onClick={() => setStrategy('SNOWBALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  strategy === 'SNOWBALL'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Snowball (Small Balance)
              </button>
            </div>

            <Button
              size="sm"
              variant="primary"
              onClick={() => handleOpenPayModal(topPriorityDebt)}
              className="bg-indigo-600 hover:bg-indigo-500 shadow-md"
            >
              Pay Installment Now
            </Button>
          </div>
        </div>
      )}

      {/* Tabs and Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-3">
        {/* Two-Way Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('OWED_BY_ME')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'OWED_BY_ME'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <ArrowDownLeft className="w-4 h-4 text-rose-400" />
            Debts I Owe ({loans.filter((l) => l.type === 'OWED_BY_ME').length})
          </button>

          <button
            onClick={() => setActiveTab('OWED_TO_ME')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'OWED_TO_ME'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <ArrowUpRight className="w-4 h-4 text-emerald-300" />
            Debts Owed to Me ({loans.filter((l) => l.type === 'OWED_TO_ME').length})
          </button>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06]">
          {(['ALL', 'ACTIVE', 'PAID_OFF'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === filter
                  ? 'bg-white/[0.1] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {filter === 'ALL' ? 'All' : filter === 'ACTIVE' ? 'Active' : 'Settled'}
            </button>
          ))}
        </div>
      </div>

      {/* Loan Cards Grid */}
      {currentTabLoans.length === 0 ? (
        <EmptyState
          icon={Coins}
          title={
            activeTab === 'OWED_BY_ME'
              ? 'No debts or loans tracked yet'
              : 'No money currently owed to you'
          }
          description={
            activeTab === 'OWED_BY_ME'
              ? 'Add your vehicle financing, bank personal loans, or family borrowings to visualize your payoff timeline.'
              : 'Record money lent to colleagues or friends so you never lose track of pending repayments.'
          }
          action={
            <Button onClick={() => handleOpenCreateModal(activeTab)}>
              <Plus className="w-4 h-4" /> Add {activeTab === 'OWED_BY_ME' ? 'Debt / Loan' : 'Receivable / IOU'}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {currentTabLoans.map((loan) => {
            const isOwedByMe = loan.type === 'OWED_BY_ME';
            const isPaidOff = loan.status === 'PAID_OFF';

            return (
              <Card
                key={loan.id}
                className={`relative flex flex-col justify-between space-y-4 border transition-all ${
                  isPaidOff
                    ? 'border-emerald-500/30 bg-emerald-950/10'
                    : 'border-white/[0.08] hover:border-white/[0.16]'
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                        style={{
                          backgroundColor: `${loan.color}20`,
                          borderColor: `${loan.color}40`,
                          color: loan.color,
                        }}
                      >
                        {isOwedByMe ? <Landmark className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white line-clamp-1">{loan.name}</h4>
                        <p className="text-[11px] text-slate-400">
                          {loan.lender ? `${loan.lender} • ` : ''}
                          {CATEGORIES.find((c) => c.value === loan.category)?.label || loan.category}
                        </p>
                      </div>
                    </div>

                    <Badge variant={isPaidOff ? 'success' : 'purple'}>
                      {isPaidOff ? 'Paid Off' : 'Active'}
                    </Badge>
                  </div>

                  {/* Balance & Progress */}
                  <div className="mt-4 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-slate-400">Remaining Balance:</span>
                      <span className="text-lg font-bold text-white tabular-nums">
                        {hide ? '••••••' : formatCurrency(loan.remainingBalance, loan.currency)}
                      </span>
                    </div>

                    <ProgressBar
                      value={loan.progressPercentage || 0}
                      color={isPaidOff ? '#10B981' : loan.color || '#6366F1'}
                      height="h-2"
                    />

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                      <span>{loan.progressPercentage}% paid off</span>
                      <span>
                        Original: {hide ? '••••' : formatCurrency(loan.originalAmount, loan.currency)}
                      </span>
                    </div>
                  </div>

                  {/* Loan Parameters (Interest, Installment, Term) */}
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div className="p-2.5 rounded-lg bg-white/[0.015] border border-white/[0.04]">
                      <span className="text-[10px] text-slate-400 block">Rate / Profit:</span>
                      <span className="font-semibold text-slate-200">
                        {loan.interestRate > 0 ? `${loan.interestRate}% APR` : '0% (Islamic / Friendly)'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-white/[0.015] border border-white/[0.04]">
                      <span className="text-[10px] text-slate-400 block">Monthly Installment:</span>
                      <span className="font-semibold text-slate-200">
                        {loan.minimumPayment > 0
                          ? `${formatCurrency(loan.minimumPayment, loan.currency)}/mo`
                          : 'Flexible'}
                      </span>
                    </div>

                    {loan.estimatedMonths !== null && loan.estimatedMonths !== undefined && (
                      <div className="p-2.5 rounded-lg bg-white/[0.015] border border-white/[0.04] col-span-2 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-indigo-400" />
                          Est. Time Remaining:
                        </span>
                        <span className="font-semibold text-indigo-300">
                          {loan.estimatedMonths === 0
                            ? 'Debt Free!'
                            : `${loan.estimatedMonths} months remaining`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLoanForHistory(loan);
                        setHistoryModalOpen(true);
                      }}
                      title="View Payment History"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(loan)}
                      title="Edit Loan"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(loan)}
                      title="Delete Loan"
                      className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {!isPaidOff ? (
                    <Button
                      size="sm"
                      variant={isOwedByMe ? 'primary' : 'emerald'}
                      onClick={() => handleOpenPayModal(loan)}
                    >
                      {isOwedByMe ? 'Pay Installment' : 'Record Repayment'}
                    </Button>
                  ) : (
                    <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Fully Settled
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 1-Click Pay Installment Modal */}
      <Modal
        isOpen={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        title={payingLoan?.type === 'OWED_BY_ME' ? 'Pay Monthly Installment' : 'Record Repayment Received'}
        subtitle={payingLoan ? `${payingLoan.name} • Remaining: ${formatCurrency(payingLoan.remainingBalance, payingLoan.currency)}` : ''}
      >
        {payingLoan && (
          <form onSubmit={handleExecutePayment} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-300 mb-1">
                Payment Amount ({payingLoan.currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={payingAmount}
                onChange={(e) => setPayingAmount(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-white font-mono"
              />
              {payingLoan.interestRate > 0 && parseFloat(payingAmount) > 0 && (
                <div className="mt-2 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] text-[11px] text-slate-300 flex justify-between">
                  <span>Estimated Interest/Profit:</span>
                  <span className="text-amber-300 font-mono">
                    {formatCurrency(
                      Math.min(
                        (payingLoan.remainingBalance * (payingLoan.interestRate / 100)) / 12,
                        parseFloat(payingAmount)
                      ),
                      payingLoan.currency
                    )}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">
                {payingLoan.type === 'OWED_BY_ME' ? 'Deduct from Account' : 'Deposit into Account'}
              </label>
              <select
                value={payAccountId}
                onChange={(e) => setPayAccountId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              >
                <option value="">None (Update loan balance only)</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currency} {acc.balance.toFixed(2)}){acc.isDefault ? ' ★ Default' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Reference / Note</label>
                <input
                  type="text"
                  placeholder="e.g. October Installment"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.06]">
              <Button type="button" variant="secondary" onClick={() => setPayModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={processingPay}
                variant={payingLoan.type === 'OWED_BY_ME' ? 'primary' : 'emerald'}
              >
                Confirm Payment
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Add / Edit Loan Modal */}
      <Modal
        isOpen={loanModalOpen}
        onClose={() => setLoanModalOpen(false)}
        title={editingLoan ? 'Edit Loan / Debt' : 'Add New Debt or Receivable'}
        subtitle="Track amortization, installment commitments, and target payoff milestones."
      >
        <form onSubmit={handleSaveLoan} className="space-y-4">
          {/* Debt Type Selector */}
          <div>
            <label className="block text-xs text-slate-300 mb-1">Tracker Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'OWED_BY_ME' })}
                className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  formData.type === 'OWED_BY_ME'
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                    : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5" /> Debt I Owe (Liability)
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'OWED_TO_ME' })}
                className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  formData.type === 'OWED_TO_ME'
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" /> Owed to Me (IOU / Receivable)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Loan / Item Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. BML Personal Loan or Vehicle"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">
                {formData.type === 'OWED_BY_ME' ? 'Lender / Bank' : 'Borrower / Friend Name'}
              </label>
              <input
                type="text"
                placeholder="e.g. Bank of Maldives or Ahmed"
                value={formData.lender}
                onChange={(e) => setFormData({ ...formData, lender: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Currency</label>
              <select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              >
                <option value="MVR">MVR (Maldivian Rufiyaa)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Original Borrowed / Lent Amount *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="50000"
                value={formData.originalAmount}
                onChange={(e) => setFormData({ ...formData, originalAmount: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Current Remaining Balance</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Leave blank to match original"
                value={formData.remainingBalance}
                onChange={(e) => setFormData({ ...formData, remainingBalance: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Annual Interest / Profit Rate (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="0"
                value={formData.interestRate}
                onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Monthly Installment</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="2500"
                value={formData.minimumPayment}
                onChange={(e) => setFormData({ ...formData, minimumPayment: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Due Day of Month</label>
              <input
                type="number"
                min="1"
                max="31"
                value={formData.dueDay}
                onChange={(e) => setFormData({ ...formData, dueDay: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Target Payoff Date (Optional)</label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Linked Account for Payments</label>
              <select
                value={formData.accountId}
                onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              >
                <option value="">None (Manual Tracking)</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currency}){acc.isDefault ? ' ★ Default' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">Notes / Terms</label>
            <textarea
              rows={2}
              placeholder="e.g. 5-year repayment plan agreed on verbal contract"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.06]">
            <Button type="button" variant="secondary" onClick={() => setLoanModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={savingLoan}>
              {editingLoan ? 'Update Loan' : 'Save to Tracker'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Payment History Modal */}
      <Modal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        title="Payment History"
        subtitle={selectedLoanForHistory ? selectedLoanForHistory.name : ''}
      >
        {selectedLoanForHistory && (
          <div className="space-y-4">
            {(!selectedLoanForHistory.payments || selectedLoanForHistory.payments.length === 0) ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                No installment payments logged for this loan yet.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto">
                {selectedLoanForHistory.payments.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between"
                  >
                    <div>
                      <p className="text-xs font-semibold text-white">
                        {formatCurrency(p.amount, selectedLoanForHistory.currency)}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {formatDate(p.date)}
                        {p.notes ? ` • ${p.notes}` : ''}
                      </p>
                    </div>
                    {p.interestAmount > 0 && (
                      <span className="text-[11px] text-amber-300 font-mono">
                        (Interest: {formatCurrency(p.interestAmount, selectedLoanForHistory.currency)})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteLoan}
        loading={deleting}
        title="Delete Loan & History"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? All associated installment payment logs will also be permanently deleted.`}
      />
    </div>
  );
}
