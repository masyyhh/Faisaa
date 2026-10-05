import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Landmark,
  PieChart,
  Target,
  Receipt,
  BarChart3,
  TrendingUp,
  Settings,
  LogOut,
  Plus,
  Search,
  Bell,
  Eye,
  EyeOff,
  Sun,
  Moon,
  CheckCheck,
  X,
  Menu,
  Coins,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api, { Notification, Transaction } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import TransactionModal from '../features/transactions/TransactionModal';
import CurrencyExchangeModal from '../features/exchange/CurrencyExchangeModal';

const NAV_ITEMS = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Transactions', path: '/transactions', icon: ArrowLeftRight },
  { name: 'Accounts', path: '/accounts', icon: Landmark },
  { name: 'Budgets', path: '/budgets', icon: PieChart },
  { name: 'Goals', path: '/goals', icon: Target },
  { name: 'Bills', path: '/bills', icon: Receipt },
  { name: 'Loans & Debts', path: '/loans', icon: Coins },
  { name: 'Analytics', path: '/analytics', icon: BarChart3 },
  { name: 'Net Worth', path: '/net-worth', icon: TrendingUp },
  { name: 'Settings', path: '/settings', icon: Settings },
];

export default function AppLayout() {
  const {
    user,
    logout,
    updateProfile,
    toggleHideBalances,
    openTransactionModal,
    openExchangeModal,
    refreshTrigger,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Transaction[]>([]);
  const [searching, setSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadNotifications() {
      try {
        const { data } = await api.get('/notifications');
        if (data.success) {
          setNotifications(data.notifications || []);
          setUnreadCount(data.unreadCount || 0);
        }
      } catch {
        // Ignore
      }
    }
    loadNotifications();
  }, [refreshTrigger, location.pathname]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
        setNotifOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 60);
    }
  }, [searchOpen]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get('/transactions', {
          params: { search: searchQuery.trim(), limit: 8 },
        });
        setSearchResults(data.transactions || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // Ignore
    }
  };

  const handleNotificationClick = async (notif: Notification) => {
    try {
      if (!notif.isRead) {
        await api.put(`/notifications/${notif.id}/read`);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch {
      // Ignore
    }
    setNotifOpen(false);
    if (notif.actionUrl) {
      navigate(notif.actionUrl);
    }
  };

  const toggleTheme = async () => {
    const nextTheme = user?.theme === 'light' ? 'dark' : 'light';
    await updateProfile({ theme: nextTheme });
  };

  const liveRate = Number(user?.usdToMvrRate || 18.45).toFixed(2);
  const notifList = Array.isArray(notifications) ? notifications : [];
  const resultsList = Array.isArray(searchResults) ? searchResults : [];

  return (
    <div className="min-h-screen flex bg-[#090A0F] text-white">
      {/* Minimalist Desktop Sidebar */}
      {/* Minimalist Desktop Sidebar */}
      <aside className="faisaa-sidebar finora-sidebar hidden lg:flex flex-col w-60 shrink-0 border-r border-white/[0.06] bg-[#0B0C12] z-30 sticky top-0 h-screen">
        {/* Brand Header */}
        <div className="h-14 px-5 flex items-center justify-between border-b border-white/[0.05]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-md shadow-indigo-600/30">
              F
            </div>
            <span className="text-base font-bold tracking-tight text-white font-display">
              Faisaa
            </span>
          </div>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/[0.05] text-zinc-400">
            MVR / $
          </span>
        </div>

        {/* Primary Action */}
        <div className="p-3.5 space-y-1.5">
          <button
            onClick={() => openTransactionModal('EXPENSE')}
            className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-indigo-600/20"
          >
            <Plus className="w-3.5 h-3.5" />
            New Transaction
          </button>
          <button
            onClick={openExchangeModal}
            className="w-full py-1.5 px-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-zinc-300 font-medium text-xs flex items-center justify-between transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5 text-zinc-400">
              <ArrowLeftRight className="w-3 h-3 text-emerald-400" />
              USD ↔ MVR
            </span>
            <span className="tabular-nums font-semibold text-emerald-400">
              {liveRate}
            </span>
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-1 space-y-0.5 overflow-y-auto" aria-label="Main Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-white/[0.07] text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.03]'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0 opacity-80" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User Footer */}
        <div className="p-3 border-t border-white/[0.05]">
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-white/[0.08] flex items-center justify-center text-white font-semibold text-xs shrink-0">
                {user?.firstName?.[0] || 'F'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-white truncate">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-[11px] text-zinc-500 truncate">{user?.username ? `@${user.username}` : user?.email}</p>
              </div>
            </div>
            <button
              onClick={logout}
              title="Log out"
              aria-label="Log out"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-white/[0.05] transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-24 lg:pb-8">
        {/* Minimalist Top Bar */}
        <header className="h-14 sticky top-0 z-30 backdrop-blur-md bg-[#090A0F]/85 border-b border-white/[0.06] px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sm:gap-4">
          {/* Mobile Menu Trigger & Brand */}
          <div className="flex items-center gap-2 lg:hidden shrink-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-zinc-300"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center text-white font-bold text-[11px]">
                F
              </div>
              <span className="font-bold text-sm text-white font-display">Faisaa</span>
            </div>
          </div>

          {/* Minimalist Search Trigger */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex-1 max-w-sm flex items-center justify-between gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-zinc-400 text-xs transition-colors cursor-pointer min-w-0"
          >
            <span className="flex items-center gap-2 truncate">
              <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <span className="hidden sm:inline">Search transactions...</span>
              <span className="sm:hidden text-zinc-500">Search...</span>
            </span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-medium bg-white/[0.05] rounded text-zinc-400">
              ⌘K
            </kbd>
          </button>

          {/* Right Controls */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Currency Rate Indicator */}
            <button
              onClick={openExchangeModal}
              title="Open USD ↔ MVR Currency Exchange"
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] text-[11px] sm:text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span className="tabular-nums hidden sm:inline">$1 = MVR {liveRate}</span>
              <span className="tabular-nums sm:hidden text-emerald-400 font-semibold">{liveRate}</span>
            </button>

            <button
              onClick={toggleHideBalances}
              title={user?.hideBalances ? 'Show balances' : 'Hide balances'}
              aria-label="Toggle balance visibility"
              className="p-1.5 sm:p-2 rounded-lg hover:bg-white/[0.06] text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              {user?.hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>

            <button
              onClick={toggleTheme}
              title="Switch theme"
              aria-label="Switch theme"
              className="p-1.5 sm:p-2 rounded-lg hover:bg-white/[0.06] text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              {user?.theme === 'light' ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen((prev) => !prev)}
                aria-label="Notifications"
                className="relative p-1.5 sm:p-2 rounded-lg hover:bg-white/[0.06] text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500" />
                )}
              </button>

              {notifOpen && (
                <div className="faisaa-card finora-card absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-sm sm:w-96 bg-[#111218] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                    <span className="text-xs font-semibold text-white">
                      Notifications ({unreadCount})
                    </span>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCheck className="w-3 h-3" /> Mark read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-white/[0.05]">
                    {notifList.length === 0 ? (
                      <div className="py-8 text-center text-xs text-zinc-500">
                        No notifications
                      </div>
                    ) : (
                      notifList.map((notif) => (
                        <div
                          key={notif.id}
                          onClick={() => handleNotificationClick(notif)}
                          className={`p-3.5 hover:bg-white/[0.03] transition-colors cursor-pointer ${
                            !notif.isRead ? 'bg-indigo-500/[0.04]' : ''
                          }`}
                        >
                          <p className="text-xs font-medium text-white">{notif.title}</p>
                          <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                            {notif.message}
                          </p>
                          <span className="text-[10px] text-zinc-500 mt-1 block">
                            {formatDate(notif.createdAt)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Page Outlet */}
        <main className="flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-6 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-[#0B0C12] border-r border-white/[0.08] h-full flex flex-col p-4 z-10 shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs">
                  F
                </div>
                <span className="font-bold text-base text-white font-display">Faisaa</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile Actions in Drawer */}
            <div className="space-y-2 mb-4">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  openTransactionModal('EXPENSE');
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" /> New Transaction
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  openExchangeModal();
                }}
                className="w-full py-2 px-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-zinc-300 font-medium text-xs flex items-center justify-between transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-400" />
                  USD ↔ MVR
                </span>
                <span className="tabular-nums font-semibold text-emerald-400">$1 = {liveRate}</span>
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-white/[0.08] text-white font-semibold'
                          : 'text-zinc-400 hover:text-white hover:bg-white/[0.03]'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 opacity-80" />
                    <span>{item.name}</span>
                  </NavLink>
                );
              })}
            </nav>

            {/* User Info & Logout */}
            <div className="mt-auto pt-3 border-t border-white/[0.06]">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-white/[0.08] flex items-center justify-center text-white font-semibold text-xs shrink-0">
                    {user?.firstName?.[0] || 'F'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white truncate">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-[10px] text-zinc-500 truncate">{user?.username ? `@${user.username}` : user?.email}</p>
                  </div>
                </div>
              </div>
              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs font-medium transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation with safe-area padding */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0B0C12]/95 backdrop-blur-lg border-t border-white/[0.08] px-2 pt-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))] flex items-center justify-around shadow-2xl">
        {[NAV_ITEMS[0], NAV_ITEMS[1], null, NAV_ITEMS[3], NAV_ITEMS[6]].map((item, idx) => {
          if (!item) {
            return (
              <button
                key="fab-add"
                onClick={() => openTransactionModal('EXPENSE')}
                aria-label="Quick Add Transaction"
                className="w-11 h-11 -mt-4 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/40 border-2 border-[#090A0F] active:scale-95 transition-transform cursor-pointer"
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
              </button>
            );
          }
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-xl text-[10px] font-medium transition-colors ${
                  isActive ? 'text-indigo-400 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Minimalist Command Search Modal */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/70 backdrop-blur-xs">
          <div className="faisaa-card finora-card w-full max-w-lg bg-[#111218] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.06]">
              <Search className="w-4 h-4 text-zinc-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search payee, category, or tag..."
                className="flex-1 bg-transparent text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none"
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {!searchQuery.trim() ? (
                <div className="py-6 text-center text-xs text-zinc-500">
                  Type to search transactions...
                </div>
              ) : searching ? (
                <div className="py-6 text-center text-xs text-zinc-500">Searching...</div>
              ) : resultsList.length === 0 ? (
                <div className="py-6 text-center text-xs text-zinc-500">
                  No results for "{searchQuery}"
                </div>
              ) : (
                <div className="space-y-0.5">
                  {resultsList.map((tx) => (
                    <div
                      key={tx.id}
                      onClick={() => {
                        setSearchOpen(false);
                        navigate(`/transactions?search=${encodeURIComponent(tx.payee)}`);
                      }}
                      className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.04] transition-colors cursor-pointer"
                    >
                      <div>
                        <p className="text-xs font-medium text-white">{tx.payee}</p>
                        <p className="text-[11px] text-zinc-500">
                          {tx.category?.name || tx.type} • {tx.account?.name} • {formatDate(tx.date)}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold tabular-nums ${
                          tx.type === 'INCOME' ? 'text-emerald-400' : 'text-white'
                        }`}
                      >
                        {tx.type === 'INCOME' ? '+' : '-'}
                        {formatCurrency(tx.amount, tx.currency || 'MVR', user?.hideBalances)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <TransactionModal />
      <CurrencyExchangeModal />
    </div>
  );
}
