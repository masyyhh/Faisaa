import React, { useState, useEffect } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Calendar,
  Tag,
  FileText,
  Repeat,
  Sparkles,
  Check,
  X,
} from 'lucide-react';
import { Modal, Button } from '../../components/ui';
import api, { Account, Category } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { detectCategoryFromPayee, type CategorySuggestion } from '../../utils/categoryMatcher';

function toLocalDateString(d: Date | string = new Date()): string {
  const date = new Date(d);
  if (isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function TransactionModal() {
  const {
    quickTxModal,
    closeTransactionModal,
    addToast,
    triggerDataRefresh,
  } = useAuth();

  const { isOpen, defaultType, editTransaction } = quickTxModal;

  const [type, setType] = useState<'INCOME' | 'EXPENSE' | 'TRANSFER'>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [txCurrency, setTxCurrency] = useState('MVR');
  const [payee, setPayee] = useState('');
  const [accountId, setAccountId] = useState('');
  const [transferToAccountId, setTransferToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(() => toLocalDateString());
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [payeeHistoryMap, setPayeeHistoryMap] = useState<Record<string, { categoryId: string; categoryName: string }>>({});
  const [suggestedCategory, setSuggestedCategory] = useState<CategorySuggestion | null>(null);
  const [isSuggestionConfirmed, setIsSuggestionConfirmed] = useState(false);
  const [userManuallySelectedCategory, setUserManuallySelectedCategory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    async function loadMeta() {
      try {
        const [accRes, catRes, historyRes] = await Promise.all([
          api.get('/accounts'),
          api.get('/categories'),
          api.get('/transactions/payee-history').catch(() => ({ data: { payeeMap: {} } })),
        ]);
        const accList = accRes.data.accounts || [];
        const catList = catRes.data.categories || [];
        const pMap = historyRes.data?.payeeMap || {};

        setAccounts(accList);
        setCategories(catList);
        setPayeeHistoryMap(pMap);
        setSuggestedCategory(null);
        setIsSuggestionConfirmed(false);
        setUserManuallySelectedCategory(false);

        const defaultAcc =
          accList.find((a: Account) => a.isDefault && a.isActive) ||
          accList.find((a: Account) => a.isDefault) ||
          accList.find((a: Account) => a.isActive) ||
          accList[0];

        if (editTransaction) {
          setType(editTransaction.type || 'EXPENSE');
          setAmount(String(editTransaction.amount || ''));
          setTxCurrency(editTransaction.currency === 'USD' ? 'USD' : 'MVR');
          setPayee(editTransaction.payee || '');
          setAccountId(editTransaction.accountId || defaultAcc?.id || '');
          const secondAcc =
            accList.find((a: Account) => a.id !== (editTransaction.accountId || defaultAcc?.id)) || defaultAcc;
          setTransferToAccountId(editTransaction.transferToAccountId || secondAcc?.id || '');
          setCategoryId(editTransaction.categoryId || '');
          setDate(editTransaction.date ? toLocalDateString(editTransaction.date) : toLocalDateString());
          setDescription(editTransaction.description || '');
          setNotes(editTransaction.notes || '');
          setTagsInput((editTransaction.tags || []).join(', '));
          setIsRecurring(Boolean(editTransaction.isRecurring));
        } else {
          const initialType = defaultType || 'EXPENSE';
          setType(initialType);
          setAmount('');
          setPayee('');
          setAccountId(defaultAcc?.id || '');
          setTxCurrency(defaultAcc?.currency === 'USD' ? 'USD' : 'MVR');
          const remainingAcc = accList.find((a: Account) => a.id !== defaultAcc?.id) || defaultAcc;
          setTransferToAccountId(remainingAcc?.id || '');
          const filteredCats = catList.filter((c: Category) => c.type === (initialType === 'INCOME' ? 'INCOME' : 'EXPENSE'));
          setCategoryId(filteredCats[0]?.id || '');
          setDate(toLocalDateString());
          setDescription('');
          setNotes('');
          setTagsInput('');
          setIsRecurring(false);
        }
        setError('');
      } catch {
        // Ignore load failure
      }
    }

    loadMeta();
  }, [isOpen, defaultType, editTransaction]);

  const handlePayeeChange = (val: string) => {
    setPayee(val);
    if (type === 'TRANSFER') return;

    const match = detectCategoryFromPayee(val, categories, payeeHistoryMap, type);
    if (match) {
      setSuggestedCategory(match);
      if (!userManuallySelectedCategory) {
        setCategoryId(match.categoryId);
        setIsSuggestionConfirmed(false);
      }
    } else {
      setSuggestedCategory(null);
      setIsSuggestionConfirmed(false);
    }
  };

  const handleTypeSwitch = (nextType: 'INCOME' | 'EXPENSE' | 'TRANSFER') => {
    setType(nextType);
    setSuggestedCategory(null);
    setIsSuggestionConfirmed(false);
    setUserManuallySelectedCategory(false);
    if (nextType !== 'TRANSFER') {
      const filtered = categories.filter((c) => c.type === nextType);
      if (filtered.length > 0) {
        setCategoryId(filtered[0].id);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }
    if (!accountId) {
      setError('Please select an account.');
      return;
    }

    setSubmitting(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const payload = {
        type,
        amount: numAmount,
        currency: txCurrency,
        payee:
          type === 'TRANSFER' && !payee.trim()
            ? 'Account Transfer'
            : payee.trim() || 'General Transaction',
        accountId,
        transferToAccountId: type === 'TRANSFER' ? transferToAccountId : null,
        categoryId: type === 'TRANSFER' ? null : categoryId || null,
        date,
        description: description.trim() || null,
        notes: notes.trim() || null,
        tags,
        isRecurring,
      };

      if (editTransaction?.id) {
        await api.put(`/transactions/${editTransaction.id}`, payload);
        addToast('Transaction updated!', 'success');
      } else {
        await api.post('/transactions', payload);
        addToast('Transaction added (& Telegram alert dispatched)!', 'success');
      }

      triggerDataRefresh();
      closeTransactionModal();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCategories = categories.filter((c) => c.type === type);

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeTransactionModal}
      title={editTransaction ? 'Edit Transaction' : 'New Transaction'}
      subtitle="Fast entry — supports Base MVR & Secondary USD ($) with automatic conversion"
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type Selector Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          {([
            { id: 'EXPENSE', label: 'Expense', icon: ArrowUpRight, activeClass: 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-xs' },
            { id: 'INCOME', label: 'Income', icon: ArrowDownLeft, activeClass: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-xs' },
            { id: 'TRANSFER', label: 'Transfer', icon: ArrowLeftRight, activeClass: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-xs' },
          ] as const).map((tab) => {
            const Icon = tab.icon;
            const active = type === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTypeSwitch(tab.id)}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  active
                    ? tab.activeClass
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
            {error}
          </div>
        )}

        {/* Large Amount Input + Currency Selector (MVR / USD) */}
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center">
          <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1">
            Transaction Amount ({txCurrency})
          </label>
          <div className="flex items-center justify-center gap-2">
            <select
              value={txCurrency}
              onChange={(e) => setTxCurrency(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-xs font-bold text-emerald-400 focus:outline-none cursor-pointer"
            >
              <option value="MVR">MVR</option>
              <option value="USD">USD ($)</option>
            </select>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-44 bg-transparent text-center text-3xl font-bold text-white focus:outline-none font-display tabular-nums"
            />
          </div>
        </div>

        {/* Payee & Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {type === 'INCOME' ? 'Source / Payer' : type === 'TRANSFER' ? 'Transfer Title' : 'Merchant / Payee'}
            </label>
            <input
              type="text"
              required={type !== 'TRANSFER'}
              value={payee}
              onChange={(e) => handlePayeeChange(e.target.value)}
              placeholder={
                type === 'INCOME'
                  ? 'e.g. Salary, Client Payout'
                  : type === 'TRANSFER'
                  ? 'e.g. Savings Sweep'
                  : 'e.g. Redwave, Coffee Lab, Dhiraagu'
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50"
            />
            {suggestedCategory && type !== 'TRANSFER' && (
              <div className="flex items-center justify-between gap-2 mt-2 px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs animate-fade-in">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="text-zinc-300 truncate">
                    Suggested: <strong className="text-white font-medium">{suggestedCategory.categoryName}</strong>
                  </span>
                  <span className="text-[10px] text-zinc-500 hidden sm:inline">
                    ({suggestedCategory.source === 'history' ? 'past match' : 'smart match'})
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isSuggestionConfirmed ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                      <Check className="w-3 h-3" /> Confirmed
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryId(suggestedCategory.categoryId);
                        setIsSuggestionConfirmed(true);
                      }}
                      className="px-2 py-0.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium transition-colors cursor-pointer"
                    >
                      Confirm ✓
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSuggestedCategory(null);
                      setIsSuggestionConfirmed(false);
                      setUserManuallySelectedCategory(true);
                    }}
                    className="p-0.5 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    title="Dismiss suggestion"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-zinc-400" /> Date
              </span>
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07] text-sm text-white focus:outline-none focus:border-indigo-500/50"
            />
          </div>
        </div>

        {/* Account & Category / Destination Account */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              {type === 'TRANSFER' ? 'From Account' : 'Account'}
            </label>
            <select
              value={accountId}
              onChange={(e) => {
                const nextId = e.target.value;
                setAccountId(nextId);
                const found = accounts.find((a) => a.id === nextId);
                if (found?.currency) {
                  setTxCurrency(found.currency === 'USD' ? 'USD' : 'MVR');
                }
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#111218] border border-white/[0.07] text-sm text-white focus:outline-none focus:border-indigo-500/50 cursor-pointer"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.currency} {Number(acc.balance).toLocaleString()}){acc.isDefault ? ' ★ Default' : ''}
                </option>
              ))}
            </select>
          </div>

          {type === 'TRANSFER' ? (
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                To Account
              </label>
              <select
                value={transferToAccountId}
                onChange={(e) => setTransferToAccountId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#111218] border border-white/[0.07] text-sm text-white focus:outline-none focus:border-indigo-500/50 cursor-pointer"
              >
                {accounts
                  .filter((a) => a.id !== accountId)
                  .map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currency} {Number(acc.balance).toLocaleString()}){acc.isDefault ? ' ★ Default' : ''}
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-zinc-300">
                  Category
                </label>
                {suggestedCategory && categoryId === suggestedCategory.categoryId && (
                  <span className="text-[10px] text-indigo-400 flex items-center gap-1 font-medium">
                    <Sparkles className="w-2.5 h-2.5" /> Suggested
                  </span>
                )}
              </div>
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setUserManuallySelectedCategory(true);
                  if (suggestedCategory && e.target.value === suggestedCategory.categoryId) {
                    setIsSuggestionConfirmed(true);
                  } else {
                    setSuggestedCategory(null);
                  }
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#111218] border border-white/[0.07] text-sm text-white focus:outline-none focus:border-indigo-500/50 cursor-pointer"
              >
                {filteredCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} {suggestedCategory?.categoryId === cat.id ? '✦ (Suggested)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Description & Tags */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              <span className="inline-flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-zinc-400" /> Description
              </span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional short note..."
              className="w-full px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              <span className="inline-flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-zinc-400" /> Tags (comma separated)
              </span>
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Essential, Work, Leisure"
              className="w-full px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50"
            />
          </div>
        </div>

        {/* Recurring Toggle */}
        <label className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] cursor-pointer">
          <div className="flex items-center gap-2.5">
            <Repeat className="w-4 h-4 text-indigo-400" />
            <div>
              <span className="text-xs font-medium text-white block">
                Recurring Transaction
              </span>
              <span className="text-[11px] text-zinc-500">
                Mark as a repeating subscription, bill, or paycheck
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
          />
        </label>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={closeTransactionModal}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {editTransaction ? 'Save Changes' : 'Add Transaction'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
