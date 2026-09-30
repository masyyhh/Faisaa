import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [quickTxModal, setQuickTxModal] = useState({
    isOpen: false,
    defaultType: 'EXPENSE',
    editTransaction: null,
  });
  const [exchangeModalOpen, setExchangeModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const triggerDataRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const openExchangeModal = useCallback(() => {
    setExchangeModalOpen(true);
  }, []);

  const closeExchangeModal = useCallback(() => {
    setExchangeModalOpen(false);
  }, []);

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  const applyTheme = useCallback((themeValue) => {
    const root = document.documentElement;
    if (themeValue === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
    }
  }, []);

  const fetchMe = useCallback(async () => {
    const token = localStorage.getItem('finora_token');
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      if (data.success) {
        setUser(data.user);
        applyTheme(data.user.theme || 'dark');
      }
    } catch {
      localStorage.removeItem('finora_token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [applyTheme]);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('finora_token', data.token);
    setUser(data.user);
    applyTheme(data.user.theme || 'dark');
    addToast(`Welcome back, ${data.user.firstName}!`, 'success');
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    localStorage.setItem('finora_token', data.token);
    setUser(data.user);
    applyTheme(data.user.theme || 'dark');
    addToast(`Welcome to Finora, ${data.user.firstName}!`, 'success');
    return data.user;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore network errors on logout
    }
    localStorage.removeItem('finora_token');
    setUser(null);
    addToast('Signed out safely.', 'info');
  };

  const updateProfile = async (updates) => {
    const { data } = await api.put('/auth/profile', updates);
    setUser(data.user);
    if (updates.theme) {
      applyTheme(updates.theme);
    }
    return data.user;
  };

  const toggleHideBalances = async () => {
    if (!user) return;
    const nextVal = !user.hideBalances;
    setUser((prev) => ({ ...prev, hideBalances: nextVal }));
    try {
      await api.put('/auth/profile', { hideBalances: nextVal });
    } catch {
      // Revert on failure
    }
  };

  const openTransactionModal = (defaultType = 'EXPENSE', editTransaction = null) => {
    setQuickTxModal({
      isOpen: true,
      defaultType,
      editTransaction,
    });
  };

  const closeTransactionModal = () => {
    setQuickTxModal({
      isOpen: false,
      defaultType: 'EXPENSE',
      editTransaction: null,
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        updateProfile,
        toggleHideBalances,
        addToast,
        toasts,
        quickTxModal,
        openTransactionModal,
        closeTransactionModal,
        exchangeModalOpen,
        openExchangeModal,
        closeExchangeModal,
        refreshUser: fetchMe,
        refreshTrigger,
        triggerDataRefresh,
      }}
    >
      {children}
      {/* Global Toast Notification Container */}
      <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-[100] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 md:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl border shadow-2xl backdrop-blur-xl transition-all duration-300 ${
              toast.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/40 text-rose-100'
                : toast.type === 'info'
                ? 'bg-slate-900/95 border-violet-500/40 text-slate-100'
                : 'bg-[#121626]/95 border-emerald-500/40 text-emerald-100'
            }`}
          >
            <div className="flex items-center gap-2.5 text-sm font-medium">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  toast.type === 'error'
                    ? 'bg-rose-400'
                    : toast.type === 'info'
                    ? 'bg-violet-400'
                    : 'bg-emerald-400'
                }`}
              />
              <span>{toast.message}</span>
            </div>
          </div>
        ))}
      </div>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
