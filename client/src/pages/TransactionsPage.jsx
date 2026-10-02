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
  Landmark,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  Card,
  Button,
  Badge,
  Modal,
  ConfirmDialog,
  EmptyState,
  LoadingState,
} from '../components/ui';
import { formatCurrency, formatDate, DynamicIcon } from '../utils/formatters';

export default function TransactionsPage() {
  const { user, openTransactionModal, addToast, refreshTrigger, triggerDataRefresh } = useAuth();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState('ALL_TX'); // ALL_TX | RECURRING
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({ totalIncome: 0, totalExpenses: 0, netFlow: 0 });
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);

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
  const [detailTx, setDetailTx] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Recurring Transactions states
  const [recurringList, setRecurringList] = useState([]);
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

  const handleDuplicate = async (txId) => {
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

  const handleCreateRecurring = async (e) => {
    e.preventDefault();
    try {
      await api.post('/recurring', {
        ...recurringForm,
        amount: parseFloat(recurringForm.amount),
      });
      addToast('Recurring schedule created!', 'success');
      setRecurringModalOpen(false);
      loadRecurring();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to create recurring rule.', 'error');
    }
  };

  const handleProcessRecurring = async (id) => {
    try {
      await api.post(`/recurring/${id}/process`);
      addToast('Recurring transaction executed & balance updated!', 'success');
      triggerDataRefresh();
    } catch {
      addToast('Failed to execute recurring transaction.', 'error');
    }
  };

  const handleDeleteRecurring = async (id) => {
    try {
      await api.delete(`/recurring/${id}`);
      addToast('Recurring rule deleted.', 'info');
      loadRecurring();
    } catch {
      addToast('Failed to delete recurring rule.', 'error');
    }
  };

  const handleExportCSV = async () => {
    try {
      const res = await api.get('/data/export/csv', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', 'faisaa-transactions.csv');
      document.body.appendChild(a);
      a.click();
      a.remove();
      addToast('Transactions exported to CSV!', 'success');
    } catch {
      addToast('CSV export failed.', 'error');
    }
  };

  const currency = user?.currency || 'MVR';
  const hide = user?.hideBalances;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
            Transactions & Ledger
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Search, filter, duplicate, and manage all your financial activity and recurring rules.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleExportCSV}>
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          {activeTab === 'RECURRING' ? (
            <>
              {dueRecurringCount > 0 && (
                <Button
                  size="sm"
                  loading={processingDue}
                  onClick={handleProcessDueRecurring}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/25"
                >
                  <Play className="w-4 h-4 mr-1" /> Run Due ({dueRecurringCount})
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => {
                  setRecurringForm((f) => ({
                    ...f,
                    accountId: accounts[0]?.id || '',
                    categoryId: categories[0]?.id || '',
                  }));
                  setRecurringModalOpen(true);
                }}
              >
                <Plus className="w-4 h-4" /> New Recurring Rule
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => openTransactionModal('EXPENSE')}>
              <Plus className="w-4 h-4" /> Add Transaction
            </Button>
          )}
        </div>
      </div>

      {/* Mode Switch Tabs */}
      <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3">
        <button
          onClick={() => setActiveTab('ALL_TX')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'ALL_TX'
              ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/25'
              : 'bg-white/[0.04] text-slate-400 hover:text-white'
          }`}
        >
          All Transactions ({pagination.total})
        </button>
        <button
          onClick={() => setActiveTab('RECURRING')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'RECURRING'
              ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/25'
              : 'bg-white/[0.04] text-slate-400 hover:text-white'
          }`}
        >
          <Repeat className="w-3.5 h-3.5" /> Recurring Schedule ({recurringList.length})
        </button>
      </div>

      {activeTab === 'ALL_TX' ? (
        <>
          {/* Summary Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
            <Card className="p-3 sm:py-4">
              <p className="text-[11px] sm:text-xs text-slate-400">Filtered Income</p>
              <p className="text-lg sm:text-xl font-extrabold text-emerald-400 mt-0.5 sm:mt-1 truncate">
                +{formatCurrency(summary.totalIncome, currency, hide)}
              </p>
            </Card>
            <Card className="p-3 sm:py-4">
              <p className="text-[11px] sm:text-xs text-slate-400">Filtered Expenses</p>
              <p className="text-lg sm:text-xl font-extrabold text-rose-400 mt-0.5 sm:mt-1 truncate">
                -{formatCurrency(summary.totalExpenses, currency, hide)}
              </p>
            </Card>
            <Card className="p-3 sm:py-4">
              <p className="text-[11px] sm:text-xs text-slate-400">Net Period Flow</p>
              <p
                className={`text-lg sm:text-xl font-extrabold mt-0.5 sm:mt-1 truncate ${
                  summary.netFlow >= 0 ? 'text-white' : 'text-rose-400'
                }`}
              >
                {summary.netFlow >= 0 ? '+' : ''}
                {formatCurrency(summary.netFlow, currency, hide)}
              </p>
            </Card>
          </div>

          {/* Filter & Search Toolbar */}
          <Card className="p-3 sm:p-5 space-y-3 sm:space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 sm:gap-3">
              {/* Search */}
              <div className="sm:col-span-2 lg:col-span-2 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search payee, notes, tags..."
                  className="faisaa-input w-full pl-10 pr-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                />
              </div>

              {/* Type Filter */}
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setPage(1);
                }}
                className="faisaa-input px-3 py-2 rounded-xl bg-[#161928] border border-white/[0.09] text-xs text-white"
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
                className="faisaa-input px-3 py-2 rounded-xl bg-[#161928] border border-white/[0.09] text-xs text-white"
              >
                <option value="ALL">All Accounts</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
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
                className="faisaa-input px-3 py-2 rounded-xl bg-[#161928] border border-white/[0.09] text-xs text-white"
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
                className="faisaa-input px-3 py-2 rounded-xl bg-[#161928] border border-white/[0.09] text-xs text-white"
              >
                <option value="date:desc">Newest First</option>
                <option value="date:asc">Oldest First</option>
                <option value="amount:desc">Highest Amount</option>
                <option value="amount:asc">Lowest Amount</option>
              </select>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-white/[0.06]">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-400 flex items-center gap-1 shrink-0">
                  <Filter className="w-3.5 h-3.5" /> Date Range:
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(1);
                  }}
                  className="faisaa-input px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.09] text-xs text-white"
                />
                <span className="text-slate-500">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPage(1);
                  }}
                  className="faisaa-input px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.09] text-xs text-white"
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
                  className="text-xs text-violet-400 hover:text-violet-300 font-medium cursor-pointer self-start sm:self-auto"
                >
                  Clear All Filters
                </button>
              )}
            </div>
          </Card>

          {/* Transactions Table / List */}
          {loading ? (
            <LoadingState label="Fetching transactions..." />
          ) : transactions.length === 0 ? (
            <EmptyState
              title="No matching transactions found"
              description="Try adjusting your search filters or record a new transaction."
              action={
                <Button onClick={() => openTransactionModal('EXPENSE')}>
                  <Plus className="w-4 h-4" /> Add Transaction
                </Button>
              }
            />
          ) : (
            <Card className="p-0 overflow-hidden">
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.07] text-[11px] uppercase tracking-wider text-slate-400 bg-white/[0.02]">
                      <th className="py-3.5 px-4">Merchant / Payee</th>
                      <th className="py-3.5 px-4">Category</th>
                      <th className="py-3.5 px-4">Account</th>
                      <th className="py-3.5 px-4">Date</th>
                      <th className="py-3.5 px-4 text-right">Amount</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05] text-sm">
                    {transactions.map((tx) => (
                      <tr
                        key={tx.id}
                        className="hover:bg-white/[0.03] transition-colors group"
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                              style={{
                                backgroundColor: `${tx.category?.color || '#8B5CF6'}20`,
                                color: tx.category?.color || '#8B5CF6',
                              }}
                            >
                              <DynamicIcon name={tx.category?.icon || 'tag'} className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-semibold text-white flex items-center gap-1.5">
                                {tx.payee}
                                {tx.isRecurring && (
                                  <Repeat className="w-3 h-3 text-violet-400" title="Recurring" />
                                )}
                              </p>
                              {tx.description && (
                                <p className="text-xs text-slate-400 truncate max-w-xs">
                                  {tx.description}
                                </p>
                              )}
                              {tx.tags && tx.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {tx.tags.map((tg) => (
                                    <span
                                      key={tg}
                                      className="px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-300 text-[10px]"
                                    >
                                      #{tg}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge variant="default">
                            {tx.category?.name || tx.type}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-300">
                          {tx.account?.name}
                          {tx.transferToAccount && ` → ${tx.transferToAccount.name}`}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-400">
                          {formatDate(tx.date, user?.dateFormat)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold">
                          <span
                            className={
                              tx.type === 'INCOME'
                                ? 'text-emerald-400'
                                : tx.type === 'EXPENSE'
                                ? 'text-white'
                                : 'text-violet-400'
                            }
                          >
                            {tx.type === 'INCOME' ? '+' : tx.type === 'EXPENSE' ? '-' : ''}
                            {formatCurrency(tx.amount, currency, hide)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setDetailTx(tx)}
                              title="View details"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openTransactionModal(tx.type, tx)}
                              title="Edit"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-white/[0.08] cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDuplicate(tx.id)}
                              title="Duplicate"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-white/[0.08] cursor-pointer"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(tx)}
                              title="Delete"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card Feed View */}
              <div className="md:hidden divide-y divide-white/[0.06]">
                {transactions.map((tx) => (
                  <div key={tx.id} className="p-3.5 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: `${tx.category?.color || '#8B5CF6'}20`,
                            color: tx.category?.color || '#8B5CF6',
                          }}
                        >
                          <DynamicIcon name={tx.category?.icon || 'tag'} className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white text-sm truncate flex items-center gap-1.5">
                            {tx.payee}
                            {tx.isRecurring && (
                              <Repeat className="w-3 h-3 text-violet-400 shrink-0" title="Recurring" />
                            )}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {formatDate(tx.date, user?.dateFormat)}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`font-bold text-sm ${
                            tx.type === 'INCOME'
                              ? 'text-emerald-400'
                              : tx.type === 'EXPENSE'
                              ? 'text-white'
                              : 'text-violet-400'
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
                      <span className="text-slate-400 px-1.5 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.06]">
                        {tx.account?.name}
                        {tx.transferToAccount && ` → ${tx.transferToAccount.name}`}
                      </span>
                      {tx.tags && tx.tags.map((tg) => (
                        <span
                          key={tg}
                          className="px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-300 text-[10px]"
                        >
                          #{tg}
                        </span>
                      ))}
                    </div>

                    {tx.description && (
                      <p className="text-xs text-slate-400 bg-white/[0.02] p-2 rounded-lg border border-white/[0.04]">
                        {tx.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setDetailTx(tx)}
                          className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-white bg-white/[0.03] text-xs flex items-center gap-1 cursor-pointer active:scale-95 transition-transform"
                        >
                          <Eye className="w-3.5 h-3.5" /> Details
                        </button>
                        <button
                          onClick={() => openTransactionModal(tx.type, tx)}
                          className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-violet-400 bg-white/[0.03] text-xs flex items-center gap-1 cursor-pointer active:scale-95 transition-transform"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Edit
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDuplicate(tx.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 bg-white/[0.03] cursor-pointer"
                          title="Duplicate"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(tx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 bg-rose-500/5 cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination Footer */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.07] bg-white/[0.01] text-xs text-slate-400">
                <span>
                  Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="w-4 h-4" /> Prev
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </>
      ) : (
        /* Recurring Transactions Schedule Tab */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(Array.isArray(recurringList) ? recurringList : []).map((rec) => {
            if (!rec) return null;
            const isDue = Boolean(rec.isActive && rec.nextOccurrence && new Date(rec.nextOccurrence) <= new Date());
            const recCurrency = rec.currency || rec.account?.currency || 'MVR';
            return (
              <Card
                key={rec.id}
                className={`flex flex-col justify-between gap-4 transition-all ${
                  isDue ? 'ring-1 ring-amber-500/40 bg-amber-500/[0.02]' : ''
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Badge variant={rec.type === 'INCOME' ? 'success' : 'purple'}>
                        {rec.frequency} • {rec.type}
                      </Badge>
                      {isDue && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold animate-pulse">
                          Due Now
                        </span>
                      )}
                    </div>
                    <span className="text-lg font-extrabold text-white">
                      {rec.type === 'INCOME' ? '+' : '-'}
                      {formatCurrency(rec.amount, recCurrency, hide)}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-3">{rec.payee}</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Account: {rec.account?.name} • Category: {rec.category?.name || 'General'}
                  </p>
                  <p className="text-xs text-violet-300 mt-2 flex items-center justify-between">
                    <span>Next: {formatDate(rec.nextOccurrence, user?.dateFormat)}</span>
                    <span className="text-[11px] text-slate-400">{recCurrency}</span>
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/[0.07]">
                  <Button
                    variant={isDue ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => handleProcessRecurring(rec.id)}
                    className={isDue ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : ''}
                  >
                    <Play className="w-3.5 h-3.5 mr-1 text-emerald-300" /> Post Now
                  </Button>
                  <button
                    onClick={() => handleDeleteRecurring(rec.id)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Transaction Detail View Modal */}
      <Modal
        isOpen={Boolean(detailTx)}
        onClose={() => setDetailTx(null)}
        title="Transaction Details"
        subtitle={detailTx ? `ID: ${detailTx.id}` : ''}
      >
        {detailTx && (
          <div className="space-y-4 text-sm">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">{detailTx.type}</p>
                <p className="text-lg font-bold text-white">{detailTx.payee}</p>
              </div>
              <p
                className={`text-2xl font-extrabold ${
                  detailTx.type === 'INCOME' ? 'text-emerald-400' : 'text-white'
                }`}
              >
                {detailTx.type === 'INCOME' ? '+' : '-'}
                {formatCurrency(detailTx.amount, currency, hide)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <span className="text-slate-400 block">Account</span>
                <span className="text-white font-semibold mt-0.5 block">
                  {detailTx.account?.name}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <span className="text-slate-400 block">Category</span>
                <span className="text-white font-semibold mt-0.5 block">
                  {detailTx.category?.name || 'Uncategorized'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <span className="text-slate-400 block">Date</span>
                <span className="text-white font-semibold mt-0.5 block">
                  {formatDate(detailTx.date, user?.dateFormat)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <span className="text-slate-400 block">Recurring</span>
                <span className="text-white font-semibold mt-0.5 block">
                  {detailTx.isRecurring ? 'Yes' : 'One-time'}
                </span>
              </div>
            </div>

            {detailTx.description && (
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs">
                <span className="text-slate-400 block">Description</span>
                <p className="text-white mt-1">{detailTx.description}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => {
                  const tx = detailTx;
                  setDetailTx(null);
                  openTransactionModal(tx.type, tx);
                }}
              >
                Edit Transaction
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Recurring Rule Modal */}
      <Modal
        isOpen={recurringModalOpen}
        onClose={() => setRecurringModalOpen(false)}
        title="Create Recurring Transaction"
        subtitle="Automate repeating income, rent, or subscriptions"
      >
        <form onSubmit={handleCreateRecurring} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Type</label>
              <select
                value={recurringForm.type}
                onChange={(e) => setRecurringForm({ ...recurringForm, type: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#181C2C] border border-white/[0.1] text-xs text-white"
              >
                <option value="EXPENSE">Expense</option>
                <option value="INCOME">Income</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Currency</label>
              <select
                value={recurringForm.currency}
                onChange={(e) => setRecurringForm({ ...recurringForm, currency: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#181C2C] border border-white/[0.1] text-xs text-white"
              >
                <option value="MVR">MVR</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Frequency</label>
              <select
                value={recurringForm.frequency}
                onChange={(e) =>
                  setRecurringForm({ ...recurringForm, frequency: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl bg-[#181C2C] border border-white/[0.1] text-xs text-white"
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Biweekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Payee / Source</label>
              <input
                type="text"
                required
                value={recurringForm.payee}
                onChange={(e) => setRecurringForm({ ...recurringForm, payee: e.target.value })}
                placeholder="e.g. Salary, Rent, Netflix"
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                required
                value={recurringForm.amount}
                onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Account</label>
              <select
                value={recurringForm.accountId}
                onChange={(e) =>
                  setRecurringForm({ ...recurringForm, accountId: e.target.value })
                }
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
                value={recurringForm.categoryId || ''}
                onChange={(e) =>
                  setRecurringForm({ ...recurringForm, categoryId: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl bg-[#181C2C] border border-white/[0.1] text-xs text-white"
              >
                <option value="">General</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Start Date</label>
              <input
                type="date"
                required
                value={recurringForm.startDate}
                onChange={(e) =>
                  setRecurringForm({ ...recurringForm, startDate: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setRecurringModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Schedule</Button>
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
        message={`Are you sure you want to delete "${deleteTarget?.payee}" (${formatCurrency(
          deleteTarget?.amount,
          currency
        )})? Your account balance will be automatically reversed.`}
      />
    </div>
  );
}
