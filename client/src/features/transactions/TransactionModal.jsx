import React, { useState, useEffect } from 'react';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Calendar, Tag, FileText, Repeat } from 'lucide-react';
import { Modal, Button } from '../../components/ui';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function TransactionModal() {
  const {
    quickTxModal,
    closeTransactionModal,
    addToast,
    triggerDataRefresh,
  } = useAuth();

  const { isOpen, defaultType, editTransaction } = quickTxModal;

  const [type, setType] = useState('EXPENSE');
  const [amount, setAmount] = useState('');
  const [txCurrency, setTxCurrency] = useState('MVR');
  const [payee, setPayee] = useState('');
  const [accountId, setAccountId] = useState('');
  const [transferToAccountId, setTransferToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);

  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    async function loadMeta() {
      try {
        const [accRes, catRes] = await Promise.all([
          api.get('/accounts'),
          api.get('/categories'),
        ]);
        const accList = accRes.data.accounts || [];
        const catList = catRes.data.categories || [];
        setAccounts(accList);
        setCategories(catList);

        if (editTransaction) {
          setType(editTransaction.type || 'EXPENSE');
          setAmount(String(editTransaction.amount || ''));
          setTxCurrency(editTransaction.currency === 'USD' ? 'USD' : 'MVR');
          setPayee(editTransaction.payee || '');
          setAccountId(editTransaction.accountId || accList[0]?.id || '');
          setTransferToAccountId(editTransaction.transferToAccountId || accList[1]?.id || '');
          setCategoryId(editTransaction.categoryId || '');
          setDate(
            editTransaction.date
              ? new Date(editTransaction.date).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0]
          );
          setDescription(editTransaction.description || '');
          setNotes(editTransaction.notes || '');
          setTagsInput((editTransaction.tags || []).join(', '));
          setIsRecurring(Boolean(editTransaction.isRecurring));
        } else {
          const initialType = defaultType || 'EXPENSE';
          setType(initialType);
          setAmount('');
          setPayee('');
          const firstAcc = accList[0];
          setAccountId(firstAcc?.id || '');
          setTxCurrency(firstAcc?.currency === 'USD' ? 'USD' : 'MVR');
          setTransferToAccountId(accList[1]?.id || accList[0]?.id || '');
          const filteredCats = catList.filter((c) => c.type === (initialType === 'INCOME' ? 'INCOME' : 'EXPENSE'));
          setCategoryId(filteredCats[0]?.id || '');
          setDate(new Date().toISOString().split('T')[0]);
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

  const handleTypeSwitch = (nextType) => {
    setType(nextType);
    if (nextType !== 'TRANSFER') {
      const filtered = categories.filter((c) => c.type === nextType);
      if (filtered.length > 0) {
        setCategoryId(filtered[0].id);
      }
    }
  };

  const handleSubmit = async (e) => {
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
    } catch (err) {
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
        <div className="grid grid-cols-3 gap-2 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.07]">
          {[
            { id: 'EXPENSE', label: 'Expense', icon: ArrowUpRight, activeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
            { id: 'INCOME', label: 'Income', icon: ArrowDownLeft, activeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
            { id: 'TRANSFER', label: 'Transfer', icon: ArrowLeftRight, activeClass: 'bg-violet-500/20 text-violet-300 border-violet-500/40' },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = type === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTypeSwitch(tab.id)}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  active
                    ? tab.activeClass
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
            {error}
          </div>
        )}

        {/* Large Amount Input + Currency Selector (MVR / USD) */}
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-center">
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">
            Transaction Amount ({txCurrency})
          </label>
          <div className="flex items-center justify-center gap-2">
            <select
              value={txCurrency}
              onChange={(e) => setTxCurrency(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] border border-white/[0.12] text-xs font-extrabold text-emerald-400 focus:outline-none cursor-pointer"
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
              className="w-44 bg-transparent text-center text-3xl font-extrabold text-white focus:outline-none"
            />
          </div>
        </div>

        {/* Payee & Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {type === 'INCOME' ? 'Source / Payer' : type === 'TRANSFER' ? 'Transfer Title' : 'Merchant / Payee'}
            </label>
            <input
              type="text"
              required={type !== 'TRANSFER'}
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder={
                type === 'INCOME'
                  ? 'e.g. Salary, Stripe'
                  : type === 'TRANSFER'
                  ? 'e.g. Savings Sweep'
                  : 'e.g. Starbucks, Netflix, Uber'
              }
              className="faisaa-input w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.09] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> Date
              </span>
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="faisaa-input w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.09] text-sm text-white focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>

        {/* Account & Category / Destination Account */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
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
              className="faisaa-input w-full px-3.5 py-2.5 rounded-xl bg-[#181C2B] border border-white/[0.09] text-sm text-white focus:outline-none focus:border-violet-500"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.currency} {Number(acc.balance).toLocaleString()})
                </option>
              ))}
            </select>
          </div>

          {type === 'TRANSFER' ? (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                To Account
              </label>
              <select
                value={transferToAccountId}
                onChange={(e) => setTransferToAccountId(e.target.value)}
                className="faisaa-input w-full px-3.5 py-2.5 rounded-xl bg-[#181C2B] border border-white/[0.09] text-sm text-white focus:outline-none focus:border-violet-500"
              >
                {accounts
                  .filter((a) => a.id !== accountId)
                  .map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currency} {Number(acc.balance).toLocaleString()})
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Category
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="faisaa-input w-full px-3.5 py-2.5 rounded-xl bg-[#181C2B] border border-white/[0.09] text-sm text-white focus:outline-none focus:border-violet-500"
              >
                {filteredCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Description & Tags */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              <span className="inline-flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" /> Description
              </span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional short note..."
              className="faisaa-input w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              <span className="inline-flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-slate-400" /> Tags (comma separated)
              </span>
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Essential, Work, Leisure"
              className="faisaa-input w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>

        {/* Recurring Toggle */}
        <label className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] cursor-pointer">
          <div className="flex items-center gap-2.5">
            <Repeat className="w-4 h-4 text-violet-400" />
            <div>
              <span className="text-xs font-semibold text-white block">
                Recurring Transaction
              </span>
              <span className="text-[11px] text-slate-400">
                Mark as a repeating subscription, bill, or paycheck
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="w-4 h-4 accent-violet-600 rounded cursor-pointer"
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
