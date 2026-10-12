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
  Calendar,
  Clock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api, { Notification, Transaction } from '../services/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import TransactionModal from '../features/transactions/TransactionModal';
import CurrencyExchangeModal from '../features/exchange/CurrencyExchangeModal';

export interface NavItem {
  name: string;
  path: string;
  icon: any;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Core',
    items: [
      { name: 'Dashboard', path: '/', icon: LayoutDashboard },
      { name: 'Transactions', path: '/transactions', icon: ArrowLeftRight },
      { name: 'Accounts', path: '/accounts', icon: Landmark },
    ],
  },
  {
    title: 'Planning',
    items: [
      { name: 'Budgets', path: '/budgets', icon: PieChart },
      { name: 'Goals', path: '/goals', icon: Target },
      { name: 'Bills', path: '/bills', icon: Receipt },
      { name: 'Loans & Debts', path: '/loans', icon: Coins },
    ],
  },
  {
    title: 'Insights',
    items: [
      { name: 'Analytics', path: '/analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'System',
    items: [
      { name: 'Settings', path: '/settings', icon: Settings },
    ],
  },
];

const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

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

  // Live navbar clock ticker
  const [currentDateTime, setCurrentDateTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
      const target = e.target as HTMLElement | null;
      const isInputActive =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (!isInputActive && (e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        openTransactionModal('EXPENSE');
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
        setNotifOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openTransactionModal]);

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

  const liveRate = Number(user?.usdToMvrRate || 15.42).toFixed(2);
  const notifList = Array.isArray(notifications) ? notifications : [];
  const resultsList = Array.isArray(searchResults) ? searchResults : [];

  return (
    <div className="min-h-screen flex bg-[#090A0F] text-white">
      {/* Minimalist Desktop Sidebar */}
      {/* Minimalist Desktop Sidebar */}
      <aside className="faisaa-sidebar finora-sidebar hidden lg:flex flex-col w-60 shrink-0 border-r border-white/[0.06] bg-[#0B0C12] z-30 sticky top-0 h-screen">
        {/* Brand Header */}
        <div className="h-14 px-5 flex items-center border-b border-white/[0.05]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-md shadow-indigo-600/30">
              F
            </div>
            <span className="text-base font-bold tracking-tight text-white font-display">
              Faisaa
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto" aria-label="Main Navigation">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title || 'main'}>
              {section.title && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 select-none">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/'}
                      className={({ isActive }) =>
                        `group flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                          isActive
                            ? 'bg-white/[0.08] text-white shadow-xs font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                        }`
                      }
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4 shrink-0 opacity-75 group-hover:opacity-100 transition-opacity" />
                        <span>{item.name}</span>
                      </div>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
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
        <header className="h-14 sticky top-0 z-30 backdrop-blur-md bg-[#090A0F]/90 border-b border-white/[0.06] px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sm:gap-4">
          {/* Mobile Menu Trigger & Brand */}
          <div className="flex items-center gap-2 lg:hidden shrink-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-zinc-300 transition-colors cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white font-bold text-[11px] shadow-xs shadow-indigo-500/20">
                F
              </div>
              <span className="font-bold text-sm text-white font-display tracking-tight">Faisaa</span>
            </div>
          </div>

          {/* Minimalist Search Trigger (Desktop: full bar, Mobile: icon button) */}
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex flex-1 max-w-xs sm:max-w-sm items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-zinc-400 text-xs transition-colors cursor-pointer min-w-0"
          >
            <span className="flex items-center gap-2 truncate">
              <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <span className="text-zinc-400">Search transactions...</span>
            </span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white/[0.04] border border-white/[0.06] rounded text-zinc-400">
              ⌘K
            </kbd>
          </button>

          {/* Live Day & Time Indicator (Desktop only) */}
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/[0.02] border border-white/[0.05] text-[11px] text-zinc-400 font-mono select-none shrink-0 tabular-nums">
            <span>
              {currentDateTime.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-200 font-medium">
              {currentDateTime.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
              })}
            </span>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Mobile Search Icon Button */}
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              className="sm:hidden p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
            </button>

            {/* Currency Rate Indicator */}
            <button
              onClick={openExchangeModal}
              title="Open USD ↔ MVR Currency Exchange"
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
            >
              <span className="text-zinc-400 text-[11px] hidden xs:inline">$</span>
              <span className="tabular-nums text-emerald-400 font-semibold">{liveRate}</span>
              <span className="text-zinc-500 text-[10px] hidden xs:inline">MVR</span>
            </button>

            {/* Balance Visibility Toggle */}
            <button
              onClick={toggleHideBalances}
              title={user?.hideBalances ? 'Show balances' : 'Hide balances'}
              aria-label="Toggle balance visibility"
              className="p-1.5 sm:p-2 rounded-lg hover:bg-white/[0.06] text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              {user?.hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>

            {/* Theme Toggle (Desktop only; on mobile accessible via drawer) */}
            <button
              onClick={toggleTheme}
              title="Switch theme"
              aria-label="Switch theme"
              className="hidden sm:inline-flex p-1.5 sm:p-2 rounded-lg hover:bg-white/[0.06] text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              {user?.theme === 'light' ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
            </button>

            {/* Quick Add Button (Desktop only — mobile has prominent bottom FAB) */}
            <button
              onClick={() => openTransactionModal('EXPENSE')}
              title="Add new transaction (Press 'N')"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white text-xs font-medium shadow-xs shadow-indigo-600/30 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
              <kbd className="hidden md:inline-block ml-0.5 px-1 py-0.2 text-[9px] font-mono bg-white/20 rounded">N</kbd>
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
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-[#090A0F]" />
                )}
              </button>

              {notifOpen && (
                <div className="faisaa-card finora-card absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-sm sm:w-96 bg-[#11121A] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden z-50">
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
                            !notif.isRead ? 'bg-indigo-500/[0.06]' : ''
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
        <main className="flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-28 lg:pb-8 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex animate-fade-in">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-[#0C0E17] border-r border-white/[0.08] h-full flex flex-col p-4 z-10 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white font-bold text-sm shadow-sm shadow-indigo-500/30">
                  F
                </div>
                <div>
                  <span className="font-bold text-base text-white font-display tracking-tight">Faisaa</span>
                  <p className="text-[10px] text-zinc-400">Financial Command Center</p>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] cursor-pointer transition-colors"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 space-y-4 overflow-y-auto pr-1" aria-label="Mobile Navigation">
              {NAV_SECTIONS.map((section) => (
                <div key={section.title || 'main'}>
                  {section.title && (
                    <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 select-none">
                      {section.title}
                    </p>
                  )}
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          end={item.path === '/'}
                          onClick={() => setMobileMenuOpen(false)}
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                              isActive
                                ? 'bg-indigo-500/15 text-indigo-300 font-semibold border border-indigo-500/25 shadow-xs'
                                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                            }`
                          }
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          <span>{item.name}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            {/* Drawer Footer: Appearance & User Info */}
            <div className="mt-auto pt-3 border-t border-white/[0.06] space-y-2.5">
              {/* Quick Theme Switch */}
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                <span className="text-xs text-zinc-400 flex items-center gap-2">
                  {user?.theme === 'light' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-400" />}
                  Theme
                </span>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 transition-colors cursor-pointer"
                >
                  {user?.theme === 'light' ? 'Light Mode' : 'Dark Mode'}
                </button>
              </div>

              {/* User info */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                    {user?.firstName?.[0] || 'F'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-[10px] text-zinc-500 truncate">{user?.username ? `@${user.username}` : user?.email}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-medium transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation with safe-area padding */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0C0E17]/95 backdrop-blur-xl border-t border-white/[0.08] px-3 pt-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))] flex items-center justify-around shadow-2xl">
        {[ALL_NAV_ITEMS[0], ALL_NAV_ITEMS[1], null, ALL_NAV_ITEMS[2], { name: 'More', path: '#more', icon: Menu }].map((item) => {
          if (!item) {
            return (
              <button
                key="fab-add"
                onClick={() => openTransactionModal('EXPENSE')}
                aria-label="Quick Add Transaction"
                className="w-11 h-11 -mt-5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-600/35 border-2 border-[#090A0F] active:scale-95 transition-all cursor-pointer"
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
              </button>
            );
          }
          if (item.path === '#more') {
            return (
              <button
                key="more-menu"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open More Menu"
                className="flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-xl text-[10px] font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <Menu className="w-4 h-4" />
                <span>More</span>
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
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/75 backdrop-blur-xs">
          <div className="faisaa-card finora-card w-full max-w-lg bg-[#11121A] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
            <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-white/[0.06]">
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
                className="p-1 rounded-md text-zinc-400 hover:text-white cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {!searchQuery.trim() ? (
                <div className="py-8 text-center text-xs text-zinc-500">
                  Type to search transactions...
                </div>
              ) : searching ? (
                <div className="py-8 text-center text-xs text-zinc-500">Searching...</div>
              ) : resultsList.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-500">
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
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-white/[0.04] transition-colors cursor-pointer"
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
