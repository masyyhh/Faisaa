import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  Copy,
  Edit3,
  Trash2,
  Eye,
  Repeat,
  Play,
  ChevronLeft,
  ChevronRight,
  Download,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api, { Account, Category, Transaction, RecurringTransaction, getStepUpToken } from '../services/api';
import { StepUpModal } from '../components/StepUpModal';
import AccountLogo from '../components/AccountLogo';
import {
  Card,
  Button,
  Badge,
  Modal,
  ConfirmDialog,
  EmptyState,
  SkeletonTable,
  Input,
  Select,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui';
import { formatCurrency, formatDate, DynamicIcon } from '../utils/formatters';

export default function TransactionsPage() {
  const { user, openTransactionModal, addToast, refreshTrigger, triggerDataRefresh } = useAuth();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<'ALL_TX' | 'RECURRING'>('ALL_TX');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState({ totalIncome: 0, totalExpenses: 0, netFlow: 0 });
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Recurring processing state
  const [processingDue, setProcessingDue] = useState(false);

  // Filter states
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [type, setType] = useState('ALL');
  const [accountId, setAccountId] = useState('ALL');
  const [categoryId, setCategoryId] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);

  // Detail & Delete Modal states
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Recurring Transactions states
  const [recurringList, setRecurringList] = useState<RecurringTransaction[]>([]);
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);
  const [recurringForm, setRecurringForm] = useState({
    payee: '',
    amount: '',
    currency: 'MVR',
    type: 'EXPENSE',
    accountId: '',
    categoryId: '',
    frequency: 'MONTHLY',
    startDate: new Date().toISOString().split('T')[0],
    description: '',
  });

  const dueRecurringCount = useMemo(() => {
    const now = new Date();
    return (Array.isArray(recurringList) ? recurringList : []).filter(
      (r) => r?.isActive && r?.nextOccurrence && new Date(r.nextOccurrence) <= now
    ).length;
  }, [recurringList]);

  const handleProcessDueRecurring = async () => {
    setProcessingDue(true);
    try {
      const { data } = await api.post('/recurring/process-due');
      if (data.processedCount > 0) {
        addToast(`Processed ${data.processedCount} due recurring transaction(s)!`, 'success');
      } else {
        addToast('No recurring transactions currently due.', 'info');
      }
      triggerDataRefresh();
      loadRecurring();
    } catch {
      addToast('Failed to process due recurring transactions.', 'error');
    } finally {
      setProcessingDue(false);
    }
  };

  const loadMeta = useCallback(async () => {
    try {
      const [accRes, catRes] = await Promise.all([
        api.get('/accounts'),
        api.get('/categories'),
      ]);
      setAccounts(accRes.data.accounts || []);
      setCategories(catRes.data.categories || []);
    } catch {
      // Ignore
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/transactions', {
        params: {
          search: search || undefined,
          type: type !== 'ALL' ? type : undefined,
          accountId: accountId !== 'ALL' ? accountId : undefined,
          categoryId: categoryId !== 'ALL' ? categoryId : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          sortBy,
          sortOrder,
          page,
          limit: 15,
        },
      });
      if (data.success) {
        setTransactions(data.transactions || []);
        setSummary(data.summary || { totalIncome: 0, totalExpenses: 0, netFlow: 0 });
        setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
      }
    } catch (err) {
      console.error('Error loading transactions:', err);
    } finally {
      setLoading(false);
    }
  }, [search, type, accountId, categoryId, startDate, endDate, sortBy, sortOrder, page]);

  const loadRecurring = useCallback(async () => {
    try {
      const { data } = await api.get('/recurring');
      if (data.success) {
        setRecurringList(data.recurringTransactions || []);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    loadTransactions();
    loadRecurring();
  }, [loadTransactions, loadRecurring, refreshTrigger]);

  const handleDuplicate = async (txId: string) => {
    try {
      await api.post(`/transactions/${txId}/duplicate`);
      addToast('Transaction duplicated!', 'success');
      triggerDataRefresh();
    } catch {
      addToast('Failed to duplicate transaction.', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/transactions/${deleteTarget.id}`);
      addToast('Transaction deleted.', 'info');
      setDeleteTarget(null);
      triggerDataRefresh();
    } catch {
      addToast('Failed to delete transaction.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/recurring', {
        ...recurringForm,
        amount: parseFloat(recurringForm.amount),
      });
      addToast('Recurring schedule created!', 'success');
      setRecurringModalOpen(false);
      loadRecurring();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Failed to create recurring rule.', 'error');
    }
  };

  const handleProcessRecurring = async (id: string) => {
    try {
      await api.post(`/recurring/${id}/process`);
      addToast('Recurring transaction executed & balance updated!', 'success');
      triggerDataRefresh();
    } catch {
      addToast('Failed to execute recurring transaction.', 'error');
    }
  };

  const handleDeleteRecurring = async (id: string) => {
    try {
      await api.delete(`/recurring/${id}`);
      addToast('Recurring rule deleted.', 'info');
      loadRecurring();
    } catch {
      addToast('Failed to delete recurring rule.', 'error');
    }
  };

  const [stepUpOpen, setStepUpOpen] = useState(false);

  const runExportCSV = async () => {
    try {
      const res = await api.get('/data/export/csv', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', 'finva-transactions.csv');
      document.body.appendChild(a);
      a.click();
      a.remove();
      addToast('Transactions exported to CSV!', 'success');
    } catch {
      addToast('CSV export failed.', 'error');
    }
  };

  const handleExportCSV = async () => {
    const token = getStepUpToken();
    if (token) {
      await runExportCSV();
    } else {
      setStepUpOpen(true);
    }
  };

  const currency = user?.currency || 'MVR';
  const hide = user?.hideBalances;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-white/[0.06]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white font-display tracking-tight flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-indigo-400" />
            Transactions &amp; Ledger
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Search, filter, categorize, duplicate, and automate recurring cashflow records.
          </p>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleExportCSV} className="w-full sm:w-auto">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
          {activeTab === 'RECURRING' ? (
            <>
              {dueRecurringCount > 0 && (
                <Button
                  size="sm"
                  variant="emerald"
                  loading={processingDue}
                  onClick={handleProcessDueRecurring}
                  className="w-full sm:w-auto"
                >
                  <Play className="w-3.5 h-3.5 mr-1" /> Run Due ({dueRecurringCount})
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => {
                  setRecurringForm((f) => ({
                    ...f,
                    accountId: accounts.find((a) => a.isDefault)?.id || accounts[0]?.id || '',
                    categoryId: categories[0]?.id || '',
                  }));
                  setRecurringModalOpen(true);
                }}
                className="w-full sm:w-auto"
              >
                <Plus className="w-3.5 h-3.5" /> New Schedule
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => openTransactionModal('EXPENSE')} className="w-full sm:w-auto">
              <Plus className="w-3.5 h-3.5" /> Add Transaction
              <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-white/[0.15] rounded text-white/90">
                N
              </kbd>
            </Button>
          )}
        </div>
      </div>

      {/* Segmented Mode Control */}
      <div className="inline-flex p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] gap-1 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('ALL_TX')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'ALL_TX'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          All Transactions ({pagination.total})
        </button>
        <button
          onClick={() => setActiveTab('RECURRING')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'RECURRING'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Repeat className="w-3.5 h-3.5" /> Recurring Rules ({recurringList.length})
        </button>
      </div>

      {activeTab === 'ALL_TX' ? (
        <>
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
            <Card className="p-4 flex flex-col justify-between">
              <span className="text-xs font-medium text-zinc-400">Filtered Income</span>
              <p className="text-xl sm:text-2xl font-bold text-emerald-400 font-display tabular-nums tracking-tight mt-1 truncate">
                +{formatCurrency(summary.totalIncome, currency, hide)}
              </p>
            </Card>
            <Card className="p-4 flex flex-col justify-between">
              <span className="text-xs font-medium text-zinc-400">Filtered Expenses</span>
              <p className="text-xl sm:text-2xl font-bold text-rose-400 font-display tabular-nums tracking-tight mt-1 truncate">
                -{formatCurrency(summary.totalExpenses, currency, hide)}
              </p>
            </Card>
            <Card className="p-4 flex flex-col justify-between">
              <span className="text-xs font-medium text-zinc-400">Net Period Flow</span>
              <p
                className={`text-xl sm:text-2xl font-bold font-display tabular-nums tracking-tight mt-1 truncate ${
                  summary.netFlow >= 0 ? 'text-white' : 'text-rose-400'
                }`}
              >
                {summary.netFlow >= 0 ? '+' : ''}
                {formatCurrency(summary.netFlow, currency, hide)}
              </p>
            </Card>
          </div>

          {/* Filter & Search Toolbar */}
          <Card className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 sm:gap-2.5">
              {/* Search */}
              <div className="sm:col-span-2 lg:col-span-2 relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3.5 top-3 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search payee, notes, tags..."
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors"
                />
              </div>

              {/* Type Filter */}
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 rounded-xl bg-[#141620] border border-white/[0.08] text-xs sm:text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors cursor-pointer"
              >
                <option value="ALL">All Types</option>
                <option value="INCOME">Income Only</option>
                <option value="EXPENSE">Expense Only</option>
                <option value="TRANSFER">Transfers Only</option>
              </select>

              {/* Account Filter */}
              <select
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 rounded-xl bg-[#141620] border border-white/[0.08] text-xs sm:text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors cursor-pointer"
              >
                <option value="ALL">All Accounts</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}{acc.isDefault ? ' ★' : ''}
                  </option>
                ))}
              </select>

              {/* Category Filter */}
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 rounded-xl bg-[#141620] border border-white/[0.08] text-xs sm:text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors cursor-pointer"
              >
                <option value="ALL">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>

              {/* Sort */}
              <select
                value={`${sortBy}:${sortOrder}`}
                onChange={(e) => {
                  const [sb, so] = e.target.value.split(':');
                  setSortBy(sb);
                  setSortOrder(so);
                }}
                className="px-3 py-2 rounded-xl bg-[#141620] border border-white/[0.08] text-xs sm:text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-colors cursor-pointer"
              >
                <option value="date:desc">Newest First</option>
                <option value="date:asc">Oldest First</option>
                <option value="amount:desc">Highest Amount</option>
                <option value="amount:asc">Lowest Amount</option>
              </select>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2.5 border-t border-white/[0.06]">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-zinc-400 flex items-center gap-1 shrink-0 font-medium">
                  <Filter className="w-3.5 h-3.5" /> Date Window:
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(1);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-zinc-200 focus:outline-none focus:border-indigo-500/60"
                />
                <span className="text-zinc-500">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPage(1);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-zinc-200 focus:outline-none focus:border-indigo-500/60"
                />
              </div>

              {(search || type !== 'ALL' || accountId !== 'ALL' || categoryId !== 'ALL' || startDate || endDate) && (
                <button
                  onClick={() => {
                    setSearch('');
                    setType('ALL');
                    setAccountId('ALL');
                    setCategoryId('ALL');
                    setStartDate('');
                    setEndDate('');
                    setPage(1);
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer self-start sm:self-auto transition-colors"
                >
                  Clear All Filters
                </button>
              )}
            </div>
          </Card>

          {/* Transactions Table / List */}
          {loading ? (
            <SkeletonTable rows={8} />
          ) : transactions.length === 0 ? (
            <EmptyState
              title="No transactions match your search"
              description="Try adjusting your filter criteria or record a new transaction to populate the ledger."
              action={
                <Button onClick={() => openTransactionModal('EXPENSE')} size="sm">
                  <Plus className="w-4 h-4" /> Add Transaction
                </Button>
              }
            />
          ) : (
            <Card className="p-0 overflow-hidden">
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Merchant / Payee</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border border-white/[0.06]"
                              style={{
                                backgroundColor: `${tx.category?.color || '#6366F1'}15`,
                                color: tx.category?.color || '#818CF8',
                              }}
                            >
                              <DynamicIcon name={tx.category?.icon || 'tag'} className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-white truncate flex items-center gap-1.5">
                                {tx.payee}
                                {tx.isRecurring && (
                                  <span title="Recurring schedule">
                                    <Repeat className="w-3 h-3 text-indigo-400" />
                                  </span>
                                )}
                              </p>
                              {tx.description && (
                                <p className="text-[11px] text-zinc-400 truncate max-w-xs mt-0.5">
                                  {tx.description}
                                </p>
                              )}
                              {tx.tags && tx.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {tx.tags.map((tg) => (
                                    <span
                                      key={tg}
                                      className="px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400 text-[10px]"
                                    >
                                      #{tg}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="default">
                            {tx.category?.name || tx.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-zinc-300">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {tx.account && <AccountLogo account={tx.account} size="xs" />}
                            <span className="truncate">{tx.account?.name}</span>
                            {tx.transferToAccount && (
                              <>
                                <span className="text-zinc-500 shrink-0">→</span>
                                <AccountLogo account={tx.transferToAccount} size="xs" />
                                <span className="truncate">{tx.transferToAccount.name}</span>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-zinc-400 tabular-nums">
                          {formatDate(tx.date, user?.dateFormat)}
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums">
                          <span
                            className={
                              tx.type === 'INCOME'
                                ? 'text-emerald-400'
                                : tx.type === 'EXPENSE'
                                ? 'text-white'
                                : 'text-indigo-400'
                            }
                          >
                            {tx.type === 'INCOME' ? '+' : tx.type === 'EXPENSE' ? '-' : ''}
                            {formatCurrency(tx.amount, currency, hide)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setDetailTx(tx)}
                              title="View transaction details"
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => openTransactionModal(tx.type, tx)}
                              title="Edit transaction"
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-400 hover:bg-white/[0.06] transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDuplicate(tx.id)}
                              title="Duplicate transaction"
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-white/[0.06] transition-colors cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(tx)}
                              title="Delete transaction"
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card Feed View */}
              <div className="md:hidden divide-y divide-white/[0.05]">
                {transactions.map((tx) => (
                  <div key={tx.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border border-white/[0.06]"
                          style={{
                            backgroundColor: `${tx.category?.color || '#6366F1'}15`,
                            color: tx.category?.color || '#818CF8',
                          }}
                        >
                          <DynamicIcon name={tx.category?.icon || 'tag'} className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white text-xs sm:text-sm truncate flex items-center gap-1.5">
                            {tx.payee}
                            {tx.isRecurring && (
                              <span title="Recurring" className="shrink-0">
                                <Repeat className="w-3 h-3 text-indigo-400" />
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-zinc-400 tabular-nums mt-0.5">
                            {formatDate(tx.date, user?.dateFormat)}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`font-bold text-sm sm:text-base tabular-nums ${
                            tx.type === 'INCOME'
                              ? 'text-emerald-400'
                              : tx.type === 'EXPENSE'
                              ? 'text-white'
                              : 'text-indigo-400'
                          }`}
                        >
                          {tx.type === 'INCOME' ? '+' : tx.type === 'EXPENSE' ? '-' : ''}
                          {formatCurrency(tx.amount, currency, hide)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <Badge variant="default" className="text-[10px] py-0.5 px-2">
                        {tx.category?.name || tx.type}
                      </Badge>
                      <span className="inline-flex items-center gap-1.5 text-zinc-400 px-2 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.06] text-[10px]">
                        {tx.account && <AccountLogo account={tx.account} size="xs" />}
                        <span>{tx.account?.name}</span>
                        {tx.transferToAccount && (
                          <>
                            <span className="text-zinc-500">→</span>
                            <AccountLogo account={tx.transferToAccount} size="xs" />
                            <span>{tx.transferToAccount.name}</span>
                          </>
                        )}
                      </span>
                      {tx.tags && tx.tags.map((tg) => (
                        <span
                          key={tg}
                          className="px-1.5 py-0.2 rounded-md bg-indigo-500/10 text-indigo-400 text-[10px]"
                        >
                          #{tg}
                        </span>
                      ))}
                    </div>

                    {tx.description && (
                      <p className="text-xs text-zinc-400 bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.04]">
                        {tx.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setDetailTx(tx)}
                          className="px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-white bg-white/[0.03] text-xs flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" /> Details
                        </button>
                        <button
                          onClick={() => openTransactionModal(tx.type, tx)}
                          className="px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-indigo-400 bg-white/[0.03] text-xs flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => handleDuplicate(tx.id)}
                          className="px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-emerald-400 bg-white/[0.03] text-xs flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" /> Duplicate
                        </button>
                      </div>

                      <button
                        onClick={() => setDeleteTarget(tx)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination Bar */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06] bg-white/[0.01]">
                  <span className="text-xs text-zinc-400">
                    Page <strong className="text-white">{pagination.page}</strong> of{' '}
                    <strong className="text-white">{pagination.totalPages}</strong> (
                    {pagination.total} total)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pagination.page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="w-3.5 h-3.5 mr-0.5" /> Prev
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    >
                      Next <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </>
      ) : (
        /* Recurring Transactions Schedule Tab */
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-zinc-400">
              Recurring templates automatically generate income or expense transactions on schedule.
            </p>
            {dueRecurringCount > 0 && (
              <Badge variant="warning">{dueRecurringCount} due to execute</Badge>
            )}
          </div>

          {recurringList.length === 0 ? (
            <EmptyState
              icon={Repeat}
              title="No recurring rules active"
              description="Automate monthly salary, subscriptions, rent, and utility deductions."
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setRecurringForm((f) => ({
                      ...f,
                      accountId: accounts.find((a) => a.isDefault)?.id || accounts[0]?.id || '',
                      categoryId: categories[0]?.id || '',
                    }));
                    setRecurringModalOpen(true);
                  }}
                >
                  <Plus className="w-3.5 h-3.5" /> Create Recurring Schedule
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
              {recurringList.map((rec) => (
                <Card key={rec.id} className="flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-semibold text-white truncate">
                          {rec.payee}
                        </h3>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">
                          {rec.frequency.toLowerCase()} • {rec.account?.name || 'Primary Account'}
                        </p>
                      </div>
                      <Badge variant={rec.type === 'INCOME' ? 'success' : 'purple'}>
                        {rec.type}
                      </Badge>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-baseline justify-between gap-2">
                      <p
                        className={`text-xl sm:text-2xl font-bold font-display tabular-nums truncate ${
                          rec.type === 'INCOME' ? 'text-emerald-400' : 'text-white'
                        }`}
                      >
                        {rec.type === 'INCOME' ? '+' : '-'}
                        {formatCurrency(rec.amount, rec.currency || currency, hide)}
                      </p>
                      {rec.nextOccurrence && (
                        <span className="text-xs text-zinc-400 flex items-center gap-1 shrink-0">
                          <Calendar className="w-3 h-3 text-indigo-400" />
                          Next: {formatDate(rec.nextOccurrence, user?.dateFormat)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-white/[0.06] gap-2">
                    <Button
                      variant="emerald"
                      size="sm"
                      onClick={() => handleProcessRecurring(rec.id)}
                    >
                      <Play className="w-3 h-3" /> Run Now
                    </Button>
                    <button
                      onClick={() => handleDeleteRecurring(rec.id)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors"
                      title="Delete recurring rule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Transaction Details Modal */}
      <Modal
        isOpen={Boolean(detailTx)}
        onClose={() => setDetailTx(null)}
        title="Transaction Record"
        subtitle={detailTx ? `${detailTx.payee} • Ledger Entry` : ''}
      >
        {detailTx && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center">
              <span className="text-xs uppercase tracking-wider text-zinc-400">Total Amount</span>
              <p
                className={`text-3xl font-bold mt-1 font-display tabular-nums ${
                  detailTx.type === 'INCOME'
                    ? 'text-emerald-400'
                    : detailTx.type === 'EXPENSE'
                    ? 'text-white'
                    : 'text-indigo-400'
                }`}
              >
                {detailTx.type === 'INCOME' ? '+' : detailTx.type === 'EXPENSE' ? '-' : ''}
                {formatCurrency(detailTx.amount, detailTx.currency || currency, hide)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                <span className="text-zinc-400 block">Type:</span>
                <span className="font-semibold text-white mt-0.5 block">{detailTx.type}</span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                <span className="text-zinc-400 block">Date:</span>
                <span className="font-semibold text-white mt-0.5 block tabular-nums">
                  {formatDate(detailTx.date, user?.dateFormat)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                <span className="text-zinc-400 block">Account:</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {detailTx.account && <AccountLogo account={detailTx.account} size="xs" />}
                  <span className="font-semibold text-white truncate">
                    {detailTx.account?.name || 'Primary'}
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                <span className="text-zinc-400 block">Category:</span>
                <span className="font-semibold text-white mt-0.5 block">
                  {detailTx.category?.name || 'General'}
                </span>
              </div>
            </div>

            {detailTx.description && (
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] text-xs">
                <span className="text-zinc-400 block">Description:</span>
                <p className="text-zinc-200 mt-0.5">{detailTx.description}</p>
              </div>
            )}

            {detailTx.tags && detailTx.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {detailTx.tags.map((tg) => (
                  <span
                    key={tg}
                    className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 text-xs font-medium"
                  >
                    #{tg}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.06]">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const txToEdit = detailTx;
                  setDetailTx(null);
                  openTransactionModal(txToEdit.type, txToEdit);
                }}
              >
                <Edit3 className="w-3.5 h-3.5 mr-1" /> Edit Transaction
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setDetailTx(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Recurring Schedule Modal */}
      <Modal
        isOpen={recurringModalOpen}
        onClose={() => setRecurringModalOpen(false)}
        title="New Recurring Schedule"
        subtitle="Set automated interval rules to auto-generate ledger entries"
      >
        <form onSubmit={handleCreateRecurring} className="space-y-4">
          <Input
            label="Payee / Label"
            required
            value={recurringForm.payee}
            onChange={(e) => setRecurringForm({ ...recurringForm, payee: e.target.value })}
            placeholder="e.g. Salary, Rent, Netflix"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Amount"
              type="number"
              step="0.01"
              required
              value={recurringForm.amount}
              onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })}
              placeholder="0.00"
            />
            <Select
              label="Transaction Type"
              value={recurringForm.type}
              onChange={(e) => setRecurringForm({ ...recurringForm, type: e.target.value })}
            >
              <option value="EXPENSE">Expense</option>
              <option value="INCOME">Income</option>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Frequency"
              value={recurringForm.frequency}
              onChange={(e) => setRecurringForm({ ...recurringForm, frequency: e.target.value })}
            >
              <option value="MONTHLY">Monthly</option>
              <option value="WEEKLY">Weekly</option>
              <option value="BIWEEKLY">Biweekly</option>
              <option value="YEARLY">Yearly</option>
            </Select>
            <Input
              label="Start Date"
              type="date"
              required
              value={recurringForm.startDate}
              onChange={(e) => setRecurringForm({ ...recurringForm, startDate: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Account"
              value={recurringForm.accountId}
              onChange={(e) => setRecurringForm({ ...recurringForm, accountId: e.target.value })}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </Select>
            <Select
              label="Category"
              value={recurringForm.categoryId}
              onChange={(e) => setRecurringForm({ ...recurringForm, categoryId: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/[0.06]">
            <Button variant="secondary" onClick={() => setRecurringModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Schedule</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        loading={deleting}
        title="Delete Transaction"
        message={`Delete "${deleteTarget?.payee}" (${formatCurrency(deleteTarget?.amount || 0, currency)})? This will automatically reverse its effect on account balances.`}
      />

      {/* Step-Up Authentication Modal for sensitive CSV Export */}
      <StepUpModal
        isOpen={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        title="Authorize Data Export"
        description="Confirm your account password to authorize downloading full transaction financial history."
        actionLabel="Authorize Export"
        onSuccess={() => runExportCSV()}
      />
    </div>
  );
}
