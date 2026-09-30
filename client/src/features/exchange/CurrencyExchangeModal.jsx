import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  ArrowLeftRight,
  RefreshCw,
  TrendingUp,
  Sparkles,
  CheckCircle2,
  Trash2,
  DollarSign,
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
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function CurrencyExchangeModal() {
  const {
    user,
    exchangeModalOpen,
    closeExchangeModal,
    refreshUser,
    triggerDataRefresh,
    addToast,
  } = useAuth();

  const [activeTab, setActiveTab] = useState('convert'); // 'convert' | 'rate'
  const [accounts, setAccounts] = useState([]);
  const [exchanges, setExchanges] = useState([]);
  const [rateHistory, setRateHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Convert form state
  const [direction, setDirection] = useState('USD_TO_MVR'); // 'USD_TO_MVR' | 'MVR_TO_USD'
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [fromAmount, setFromAmount] = useState('100');
  const [exchangeRate, setExchangeRate] = useState(user?.usdToMvrRate || 18.45);
  const [fee, setFee] = useState('0');
  const [notes, setNotes] = useState('');
  const [updateGlobalRate, setUpdateGlobalRate] = useState(true);

  // Rate update form state
  const [newGlobalRate, setNewGlobalRate] = useState(user?.usdToMvrRate || 18.45);
  const [rateNote, setRateNote] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [accRes, exRes] = await Promise.all([
        api.get('/accounts'),
        api.get('/exchange'),
      ]);
      const allAccs = accRes.data?.accounts || [];
      setAccounts(allAccs);
      setExchanges(exRes.data?.exchanges || []);
      setRateHistory(exRes.data?.rateHistory || []);

      const currentRate = exRes.data?.currentRate || user?.usdToMvrRate || 18.45;
      setExchangeRate(currentRate);
      setNewGlobalRate(currentRate);

      const usdAccs = allAccs.filter((a) => a.currency === 'USD');
      const mvrAccs = allAccs.filter((a) => a.currency !== 'USD');
      if (usdAccs.length > 0 && !fromAccountId) setFromAccountId(usdAccs[0].id);
      if (mvrAccs.length > 0 && !toAccountId) setToAccountId(mvrAccs[0].id);
    } catch {
      // Ignore error
    } finally {
      setLoading(false);
    }
  }, [user?.usdToMvrRate, fromAccountId, toAccountId]);

  useEffect(() => {
    if (exchangeModalOpen) {
      loadData();
    }
  }, [exchangeModalOpen, loadData]);

  // Swap default accounts when direction toggles
  const handleToggleDirection = (nextDir) => {
    setDirection(nextDir);
    const usdAccs = accounts.filter((a) => a.currency === 'USD');
    const mvrAccs = accounts.filter((a) => a.currency !== 'USD');
    if (nextDir === 'USD_TO_MVR') {
      if (usdAccs[0]) setFromAccountId(usdAccs[0].id);
      if (mvrAccs[0]) setToAccountId(mvrAccs[0].id);
      setFromAmount('100');
    } else {
      if (mvrAccs[0]) setFromAccountId(mvrAccs[0].id);
      if (usdAccs[0]) setToAccountId(usdAccs[0].id);
      setFromAmount('1845');
    }
  };

  if (!exchangeModalOpen) return null;

  const fromCurrency = direction === 'USD_TO_MVR' ? 'USD' : 'MVR';
  const toCurrency = direction === 'USD_TO_MVR' ? 'MVR' : 'USD';

  const parsedFromAmount = parseFloat(fromAmount) || 0;
  const parsedRate = parseFloat(exchangeRate) || 15.42;
  const parsedFee = parseFloat(fee) || 0;

  const calculatedToAmount =
    direction === 'USD_TO_MVR'
      ? Math.max(0, parsedFromAmount * parsedRate - parsedFee)
      : Math.max(0, parsedFromAmount / parsedRate - parsedFee);

  const sourceAccounts = accounts.filter((a) =>
    fromCurrency === 'USD' ? a.currency === 'USD' : a.currency !== 'USD'
  );
  const destinationAccounts = accounts.filter((a) =>
    toCurrency === 'USD' ? a.currency === 'USD' : a.currency !== 'USD'
  );

  const handleConvertSubmit = async (e) => {
    e.preventDefault();
    if (!fromAccountId || !toAccountId) {
      addToast('Please select both source and destination accounts', 'error');
      return;
    }
    if (parsedFromAmount <= 0 || parsedRate <= 0) {
      addToast('Please enter a valid amount and exchange rate', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/exchange/convert', {
        fromAccountId,
        toAccountId,
        fromCurrency,
        toCurrency,
        fromAmount: parsedFromAmount,
        exchangeRate: parsedRate,
        fee: parsedFee,
        notes: notes || `Exchanged ${fromCurrency} to ${toCurrency} @ ${parsedRate}`,
        updateGlobalRate,
      });

      await refreshUser();
      triggerDataRefresh();
      await loadData();
      addToast(
        `Exchanged ${formatCurrency(parsedFromAmount, fromCurrency)} → ${formatCurrency(
          calculatedToAmount,
          toCurrency
        )} (@ ${parsedRate})`,
        'success'
      );
      setNotes('');
    } catch (err) {
      addToast(err.response?.data?.message || 'Currency exchange failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRateSubmit = async (e) => {
    e.preventDefault();
    const rateVal = parseFloat(newGlobalRate);
    if (!rateVal || rateVal <= 0) {
      addToast('Please enter a valid USD to MVR rate', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.put('/exchange/rate', {
        rate: rateVal,
        note: rateNote || 'Manual rate update from Exchange Tracker',
      });
      await refreshUser();
      triggerDataRefresh();
      await loadData();
      addToast(
        `Exchange rate updated to $1 = MVR ${rateVal.toFixed(2)}. All dashboard totals adjusted!`,
        'success'
      );
      setRateNote('');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to update exchange rate', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExchange = async (id) => {
    try {
      await api.delete(`/exchange/${id}`);
      await refreshUser();
      triggerDataRefresh();
      await loadData();
      addToast('Exchange reversed and account balances restored', 'info');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to revert exchange', 'error');
    }
  };

  const chartData = [...rateHistory]
    .reverse()
    .map((item) => ({
      date: formatDate(item.createdAt, { month: 'short', day: 'numeric' }),
      rate: Number(item.rate),
      note: item.note,
    }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="finora-card w-full max-w-2xl bg-[#111422] border border-white/[0.1] rounded-3xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-600/20">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-display">
                USD ($) ↔ MVR Currency Exchange & Rate Tracker
              </h3>
              <p className="text-xs text-slate-400">
                Base: <strong className="text-emerald-400">MVR</strong> • Secondary:{' '}
                <strong className="text-violet-400">USD ($)</strong> • Live Rate:{' '}
                <strong className="text-white">$1 = MVR {Number(user?.usdToMvrRate || 18.45).toFixed(2)}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={closeExchangeModal}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 flex gap-2 border-b border-white/[0.06]">
          <button
            type="button"
            onClick={() => setActiveTab('convert')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'convert'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Convert $ ↔ MVR
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rate')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'rate'
                ? 'border-violet-400 text-violet-400 bg-violet-500/10'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Live Rate & History ({exchanges.length})
          </button>
        </div>

        <div className="p-6 max-h-[78vh] overflow-y-auto space-y-6">
          {activeTab === 'convert' ? (
            <form onSubmit={handleConvertSubmit} className="space-y-4">
              {/* Direction Selector */}
              <div className="grid grid-cols-2 gap-2.5 p-1.5 rounded-2xl bg-white/[0.04] border border-white/[0.07]">
                <button
                  type="button"
                  onClick={() => handleToggleDirection('USD_TO_MVR')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    direction === 'USD_TO_MVR'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  Sell USD ($) → Get MVR
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleDirection('MVR_TO_USD')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    direction === 'MVR_TO_USD'
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Buy USD ($) ← From MVR
                </button>
              </div>

              {/* Accounts Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    From Account ({fromCurrency})
                  </label>
                  <select
                    value={fromAccountId}
                    onChange={(e) => setFromAccountId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-white focus:outline-none focus:border-emerald-500"
                    required
                  >
                    <option value="">Select {fromCurrency} Account</option>
                    {(sourceAccounts.length ? sourceAccounts : accounts).map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({formatCurrency(acc.balance, acc.currency)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    To Account ({toCurrency})
                  </label>
                  <select
                    value={toAccountId}
                    onChange={(e) => setToAccountId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-white focus:outline-none focus:border-emerald-500"
                    required
                  >
                    <option value="">Select {toCurrency} Account</option>
                    {(destinationAccounts.length ? destinationAccounts : accounts).map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({formatCurrency(acc.balance, acc.currency)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Amount & Rate Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Amount ({fromCurrency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={fromAmount}
                    onChange={(e) => setFromAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-white font-bold focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Exchange Rate ($1 = MVR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Fee ({toCurrency}, optional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Live Conversion Preview Box */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-violet-500/10 border border-emerald-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-bold text-emerald-400 block">
                    Live Conversion Output
                  </span>
                  <p className="text-lg font-extrabold text-white mt-0.5">
                    {formatCurrency(parsedFromAmount, fromCurrency)} →{' '}
                    <span className="text-emerald-400">
                      {formatCurrency(calculatedToAmount, toCurrency)}
                    </span>
                  </p>
                  <p className="text-xs text-slate-400">
                    Rate applied: $1.00 USD = MVR {parsedRate.toFixed(2)} (Official BML 15.42 / Parallel Market)
                  </p>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={updateGlobalRate}
                    onChange={(e) => setUpdateGlobalRate(e.target.checked)}
                    className="rounded border-white/20 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span>Set as live dashboard rate</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Exchange Note (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., Exchanged $250 via BML USD Transfer / Parallel market"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeExchangeModal}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/25 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {submitting ? 'Executing Exchange...' : 'Confirm Currency Exchange'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              {/* Quick Update Global Rate Form */}
              <form
                onSubmit={handleUpdateRateSubmit}
                className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-violet-400" />
                      Update Live USD → MVR Valuation Rate
                    </h4>
                    <p className="text-xs text-slate-400">
                      Changing this rate immediately recalculates your Dashboard Total Balance, Income, Expenses, and Net Worth in MVR.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      New Rate ($1 USD = MVR)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={newGlobalRate}
                      onChange={(e) => setNewGlobalRate(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/[0.12] text-sm font-bold text-emerald-400 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Note / Source
                    </label>
                    <input
                      type="text"
                      value={rateNote}
                      onChange={(e) => setRateNote(e.target.value)}
                      placeholder="e.g., Parallel market rate today"
                      className="w-full px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/[0.12] text-sm text-white focus:outline-none"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-2 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md cursor-pointer"
                    >
                      {submitting ? 'Updating...' : 'Update Live Rate'}
                    </button>
                  </div>
                </div>

                {/* Preset Rate Pills */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] text-slate-400">Quick Presets:</span>
                  {[
                    { label: 'BML Official (15.42)', val: 15.42 },
                    { label: 'Market (18.20)', val: 18.2 },
                    { label: 'Market (18.45)', val: 18.45 },
                    { label: 'Market (18.65)', val: 18.65 },
                    { label: 'High (19.00)', val: 19.0 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setNewGlobalRate(preset.val)}
                      className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-[11px] font-semibold text-slate-300 cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </form>

              {/* Exchange Rate History Chart */}
              {chartData.length > 0 && (
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                    USD → MVR Exchange Rate History
                  </h4>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="date" stroke="#64748B" fontSize={11} />
                        <YAxis domain={['auto', 'auto']} stroke="#64748B" fontSize={11} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#121524',
                            borderColor: 'rgba(255,255,255,0.1)',
                            borderRadius: '12px',
                            fontSize: '12px',
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="rate"
                          stroke="#10B981"
                          strokeWidth={2.5}
                          fill="url(#rateGrad)"
                          name="MVR per $1"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Past Currency Exchanges Log */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                  Recent Currency Exchanges ({exchanges.length})
                </h4>
                {loading ? (
                  <p className="text-xs text-slate-400 py-4">Loading exchange history...</p>
                ) : exchanges.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4">
                    No currency exchanges recorded yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {exchanges.map((ex) => (
                      <div
                        key={ex.id}
                        className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">
                              {formatCurrency(ex.fromAmount, ex.fromCurrency)} →{' '}
                              <span className="text-emerald-400">
                                {formatCurrency(ex.toAmount, ex.toCurrency)}
                              </span>
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              @ {Number(ex.exchangeRate).toFixed(2)} MVR/$
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {ex.fromAccount?.name} → {ex.toAccount?.name} • {formatDate(ex.date)}
                            {ex.notes ? ` • ${ex.notes}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteExchange(ex.id)}
                          title="Revert exchange"
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
