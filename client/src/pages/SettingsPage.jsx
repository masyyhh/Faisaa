import React, { useState, useEffect, useCallback } from 'react';
import {
  User,
  Lock,
  Tag,
  Bell,
  Database,
  Download,
  Upload,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Card, Button, Badge } from '../components/ui';
import { DynamicIcon } from '../utils/formatters';

export default function SettingsPage() {
  const { user, updateProfile, addToast, triggerDataRefresh } = useAuth();
  const [activeTab, setActiveTab] = useState('PROFILE');

  // Profile State
  const [profileForm, setProfileForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    currency: 'MVR',
    secondaryCurrency: 'USD',
    usdToMvrRate: user?.usdToMvrRate || 18.45,
    dateFormat: user?.dateFormat || 'MMM dd, yyyy',
    theme: user?.theme || 'dark',
    telegramEnabled: user?.telegramEnabled ?? true,
    telegramBotToken: user?.telegramBotToken || '',
    telegramChatId: user?.telegramChatId || '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);

  // Password State
  const [pwForm, setPwForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [savingPw, setSavingPw] = useState(false);

  // Categories State
  const [categories, setCategories] = useState([]);
  const [catForm, setCatForm] = useState({
    name: '',
    type: 'EXPENSE',
    color: '#8B5CF6',
    icon: 'tag',
  });

  // CSV Import State
  const [csvPreviewRows, setCsvPreviewRows] = useState([]);
  const [csvErrors, setCsvErrors] = useState([]);
  const [importingCsv, setImportingCsv] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      const { data } = await api.get('/categories');
      if (data.success) setCategories(data.categories || []);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateProfile({
        ...profileForm,
        currency: 'MVR',
        secondaryCurrency: 'USD',
        usdToMvrRate: Number(profileForm.usdToMvrRate) || 18.45,
      });
      triggerDataRefresh();
      addToast('Profile, MVR/USD rate & preferences saved!', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to update profile.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSendTelegramTest = async () => {
    setTestingTelegram(true);
    try {
      const { data } = await api.post('/notifications/telegram-test', {
        botToken: profileForm.telegramBotToken,
        chatId: profileForm.telegramChatId,
      });
      if (data.success) {
        addToast('Telegram test notification delivered to your Telegram chat!', 'success');
      }
    } catch (err) {
      addToast(
        err.response?.data?.message || 'Telegram test failed. Verify Bot Token and Chat ID.',
        'error'
      );
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleSavePassword = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      addToast('New passwords do not match.', 'error');
      return;
    }
    setSavingPw(true);
    try {
      await api.put('/auth/password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      addToast('Password changed successfully!', 'success');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      addToast(err.response?.data?.message || 'Password update failed.', 'error');
    } finally {
      setSavingPw(false);
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!catForm.name.trim()) return;
    try {
      await api.post('/categories', catForm);
      addToast(`Category "${catForm.name}" created!`, 'success');
      setCatForm({ name: '', type: 'EXPENSE', color: '#8B5CF6', icon: 'tag' });
      loadCategories();
    } catch {
      addToast('Failed to create category.', 'error');
    }
  };

  const handleDeleteCategory = async (id) => {
    try {
      await api.delete(`/categories/${id}`);
      addToast('Category deleted.', 'info');
      loadCategories();
    } catch {
      addToast('Failed to delete category.', 'error');
    }
  };

  const handleExportCSV = async () => {
    try {
      const res = await api.get('/data/export/csv', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'finora-transactions.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      addToast('CSV exported successfully!', 'success');
    } catch {
      addToast('CSV export failed.', 'error');
    }
  };

  const handleExportJSON = async () => {
    try {
      const { data } = await api.get('/data/export/json');
      const blob = new Blob([JSON.stringify(data.backup, null, 2)], {
        type: 'application/json',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'finora-backup.json');
      document.body.appendChild(link);
      link.click();
      link.remove();
      addToast('Full JSON backup downloaded!', 'success');
    } catch {
      addToast('JSON export failed.', 'error');
    }
  };

  const handleCSVFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        setCsvErrors(['CSV file must contain a header row and at least 1 data row.']);
        setCsvPreviewRows([]);
        return;
      }

      const headers = lines[0].split(',').map((h) => h.replace(/"/g, '').trim());
      const requiredCols = ['Date', 'Payee', 'Amount'];
      const missingCols = requiredCols.filter(
        (req) => !headers.some((h) => h.toLowerCase() === req.toLowerCase())
      );

      const errs = [];
      if (missingCols.length > 0) {
        errs.push(`Missing required columns: ${missingCols.join(', ')}`);
      }

      const parsedRows = lines.slice(1).map((line, idx) => {
        const cols = line.split(',').map((c) => c.replace(/"/g, '').trim());
        const rowObj = {};
        headers.forEach((h, i) => {
          rowObj[h] = cols[i] || '';
        });
        const amt = parseFloat(rowObj.Amount || rowObj.amount);
        if (isNaN(amt) || amt <= 0) {
          errs.push(`Row ${idx + 2}: Invalid amount "${rowObj.Amount || rowObj.amount}"`);
        }
        return rowObj;
      });

      setCsvErrors(errs);
      setCsvPreviewRows(parsedRows);
    };
    reader.readAsText(file);
  };

  const handleConfirmCSVImport = async () => {
    if (csvPreviewRows.length === 0) return;
    setImportingCsv(true);
    try {
      const { data } = await api.post('/data/import/csv', {
        rows: csvPreviewRows,
      });
      addToast(data.message || 'CSV imported!', 'success');
      setCsvPreviewRows([]);
      setCsvErrors([]);
      triggerDataRefresh();
    } catch (err) {
      addToast(err.response?.data?.message || 'Import failed.', 'error');
    } finally {
      setImportingCsv(false);
    }
  };

  const handleJSONRestoreFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        const res = await api.post('/data/import/json', { backup: parsed });
        addToast(res.data.message || 'Backup restored!', 'success');
        triggerDataRefresh();
      } catch {
        addToast('Invalid JSON backup file.', 'error');
      }
    };
    reader.readAsText(file);
  };

  const TABS = [
    { id: 'PROFILE', label: 'Profile & Currency', icon: User },
    { id: 'SECURITY', label: 'Security', icon: Lock },
    { id: 'CATEGORIES', label: 'Categories', icon: Tag },
    { id: 'NOTIFICATIONS', label: 'Notifications', icon: Bell },
    { id: 'DATA', label: 'Data Import / Export', icon: Database },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
          Workspace Settings
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
          Configure your MVR (Base) & USD ($) exchange rate, Telegram Bot alerts, categories, and backups.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] pb-3">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === t.id
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/25'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'PROFILE' && (
        <Card className="max-w-2xl">
          <h3 className="text-base font-bold text-white mb-4">
            Profile, MVR/USD Currency & Display Preferences
          </h3>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">First Name</label>
                <input
                  type="text"
                  required
                  value={profileForm.firstName}
                  onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Last Name</label>
                <input
                  type="text"
                  required
                  value={profileForm.lastName}
                  onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  Base & Secondary Currency
                </label>
                <input
                  type="text"
                  disabled
                  value="Base: MVR • Secondary: USD ($)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs font-bold text-emerald-400"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  Live Exchange Rate ($1 = MVR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={profileForm.usdToMvrRate}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, usdToMvrRate: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm font-bold text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Interface Theme</label>
                <select
                  value={profileForm.theme}
                  onChange={(e) => setProfileForm({ ...profileForm, theme: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#181C2C] border border-white/[0.1] text-sm text-white"
                >
                  <option value="dark">Dark Fintech (Default)</option>
                  <option value="light">Clean White / Light Mode</option>
                </select>
              </div>
            </div>

            <div className="pt-2">
              <Button type="submit" loading={savingProfile}>
                Save Preferences
              </Button>
            </div>
          </form>
        </Card>
      )}

      {activeTab === 'SECURITY' && (
        <Card className="max-w-xl">
          <h3 className="text-base font-bold text-white mb-4">Change Account Password</h3>
          <form onSubmit={handleSavePassword} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Current Password</label>
              <input
                type="password"
                required
                value={pwForm.currentPassword}
                onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">New Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={pwForm.newPassword}
                onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Confirm New Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={pwForm.confirmPassword}
                onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-sm text-white"
              />
            </div>
            <Button type="submit" loading={savingPw}>
              Update Password
            </Button>
          </form>
        </Card>
      )}

      {activeTab === 'CATEGORIES' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card className="lg:col-span-4 h-fit">
            <h3 className="text-base font-bold text-white mb-4">Create Custom Category</h3>
            <form onSubmit={handleAddCategory} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Category Name</label>
                <input
                  type="text"
                  required
                  value={catForm.name}
                  onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                  placeholder="e.g. Side Hustle, Pet Care"
                  className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Type</label>
                <select
                  value={catForm.type}
                  onChange={(e) => setCatForm({ ...catForm, type: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#181C2C] border border-white/[0.1] text-xs text-white"
                >
                  <option value="EXPENSE">Expense</option>
                  <option value="INCOME">Income</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Color</label>
                <input
                  type="color"
                  value={catForm.color}
                  onChange={(e) => setCatForm({ ...catForm, color: e.target.value })}
                  className="w-full h-9 rounded-xl bg-transparent cursor-pointer"
                />
              </div>
              <Button type="submit" className="w-full">
                <Plus className="w-4 h-4" /> Add Category
              </Button>
            </form>
          </Card>

          <Card className="lg:col-span-8">
            <h3 className="text-base font-bold text-white mb-4">
              Your Income & Expense Categories ({categories.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-96 overflow-y-auto pr-1">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                    >
                      <DynamicIcon name={cat.icon} className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">{cat.name}</p>
                      <Badge variant={cat.type === 'INCOME' ? 'success' : 'default'}>
                        {cat.type}
                      </Badge>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'NOTIFICATIONS' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Telegram Bot Notifications</h3>
                <p className="text-xs text-slate-400">
                  Receive instant Telegram alerts whenever transactions, currency exchanges, exchange rate changes, or budget warnings occur.
                </p>
              </div>
              <Badge variant={profileForm.telegramEnabled ? 'success' : 'default'}>
                {profileForm.telegramEnabled ? 'Active' : 'Disabled'}
              </Badge>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-3">
              <label className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.07] cursor-pointer">
                <div>
                  <p className="text-sm font-semibold text-white">Enable Telegram Bot Alerts</p>
                  <p className="text-xs text-slate-400">
                    Push notifications to your configured Telegram Chat ID
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(profileForm.telegramEnabled)}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, telegramEnabled: e.target.checked })
                  }
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
              </label>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Telegram Bot Token</label>
                <input
                  type="text"
                  value={profileForm.telegramBotToken}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, telegramBotToken: e.target.value })
                  }
                  placeholder="8854737122:AAExL-MBGhKfPvRE33RKsQ8H9pYB3_2dWY4"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs font-mono text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Telegram Chat ID</label>
                <input
                  type="text"
                  value={profileForm.telegramChatId}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, telegramChatId: e.target.value })
                  }
                  placeholder="6744792618"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs font-mono text-white"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button type="submit" loading={savingProfile}>
                  Save Telegram Settings
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  loading={testingTelegram}
                  onClick={handleSendTelegramTest}
                >
                  Send Test Telegram Alert
                </Button>
              </div>
            </form>
          </Card>

          <Card className="space-y-4">
            <h3 className="text-base font-bold text-white">Automated Alert Rules</h3>
            {[
              {
                key: 'notifyBudgetAlerts',
                title: 'Monthly Budget Warnings',
                desc: 'Notify via In-App & Telegram when spending exceeds 80% or 100% of a category limit',
              },
              {
                key: 'notifyBillReminders',
                title: 'Upcoming & Overdue Bill Reminders',
                desc: 'Receive reminders 24 hours before bills and subscriptions are due',
              },
              {
                key: 'notifyGoalMilestones',
                title: 'Savings Goal Milestones',
                desc: 'Celebrate reaching 25%, 50%, 75%, and 100% of your financial goals',
              },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.07] cursor-pointer"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="text-xs text-slate-400">{item.desc}</p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(user?.[item.key])}
                  onChange={(e) => updateProfile({ [item.key]: e.target.checked })}
                  className="w-4 h-4 accent-violet-600 rounded"
                />
              </label>
            ))}
          </Card>
        </div>
      )}

      {activeTab === 'DATA' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Export & Backup Card */}
          <Card className="space-y-4">
            <h3 className="text-base font-bold text-white">Export & Full JSON Backup</h3>
            <p className="text-xs text-slate-400">
              Download your complete transaction ledger in CSV format or export a portable JSON snapshot.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleExportCSV}>
                <Download className="w-4 h-4" /> Export Transactions (CSV)
              </Button>
              <Button variant="secondary" onClick={handleExportJSON}>
                <Download className="w-4 h-4" /> Full Workspace Backup (JSON)
              </Button>
            </div>

            <div className="pt-4 border-t border-white/[0.07]">
              <label className="block text-xs font-semibold text-white mb-2">
                Restore from JSON Backup
              </label>
              <input
                type="file"
                accept=".json"
                onChange={handleJSONRestoreFile}
                className="text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-violet-600/20 file:text-violet-300 hover:file:bg-violet-600/30 cursor-pointer"
              />
            </div>
          </Card>

          {/* CSV Import Wizard */}
          <Card className="space-y-4">
            <h3 className="text-base font-bold text-white">
              CSV Transaction Import (With Validation & Preview)
            </h3>
            <p className="text-xs text-slate-400">
              Upload a CSV containing columns: <code>Date, Type, Payee, Amount, Category</code>.
            </p>

            <input
              type="file"
              accept=".csv"
              onChange={handleCSVFileSelect}
              className="text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-600/20 file:text-emerald-300 hover:file:bg-emerald-600/30 cursor-pointer"
            />

            {csvErrors.length > 0 && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 space-y-1">
                <p className="font-bold flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> Validation Warnings:
                </p>
                {csvErrors.map((e, i) => (
                  <p key={i}>• {e}</p>
                ))}
              </div>
            )}

            {csvPreviewRows.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> {csvPreviewRows.length} rows ready to import
                  </span>
                  <Button
                    size="sm"
                    variant="emerald"
                    loading={importingCsv}
                    onClick={handleConfirmCSVImport}
                  >
                    <Upload className="w-3.5 h-3.5" /> Confirm & Import Now
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-white/[0.08]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/[0.04] text-slate-400">
                      <tr>
                        <th className="p-2">Date</th>
                        <th className="p-2">Payee</th>
                        <th className="p-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {csvPreviewRows.slice(0, 8).map((r, idx) => (
                        <tr key={idx}>
                          <td className="p-2 text-slate-300">{r.Date || r.date}</td>
                          <td className="p-2 text-white font-medium">{r.Payee || r.payee}</td>
                          <td className="p-2 text-emerald-400">{r.Amount || r.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
