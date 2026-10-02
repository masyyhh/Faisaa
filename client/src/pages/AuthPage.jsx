import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Mail, Lock, User, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui';

export default function AuthPage() {
  const location = useLocation();
  const isRegister = location.pathname === '/register';
  const navigate = useNavigate();
  const { login, register } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currency, setCurrency] = useState('MVR');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await register({
          firstName,
          lastName,
          username: username.trim() ? username.trim().toLowerCase() : undefined,
          email,
          password,
          currency,
        });
      } else {
        await login(email, password);
      }
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError('');
    setDemoLoading(true);
    try {
      try {
        await login('alex', 'Password123!');
      } catch {
        await login('alex@faisaa.io', 'Password123!');
      }
      navigate('/');
    } catch {
      setError('Could not sign in to demo account.');
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090A0F] text-white flex items-center justify-center p-3.5 sm:p-8">
      <div className="faisaa-card finora-card w-full max-w-md bg-[#111218] border border-white/[0.08] rounded-2xl p-5 sm:p-8 shadow-2xl">
        {/* Brand */}
        <div className="flex items-center justify-between mb-5 sm:mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-md shadow-indigo-600/30">
              F
            </div>
            <span className="text-lg font-bold tracking-tight font-display">Faisaa</span>
          </div>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-white/[0.05] text-zinc-400">
            MVR & USD
          </span>
        </div>

        <h1 className="text-xl font-bold text-white tracking-tight">
          {isRegister ? 'Create your account' : 'Sign in to Faisaa'}
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          {isRegister
            ? 'Minimalist personal finance for MVR & USD accounts.'
            : 'Welcome back. Enter your credentials or use instant demo access.'}
        </p>

        {/* Instant Demo Access */}
        <div className="mt-5">
          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={demoLoading}
            className="w-full py-2.5 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-white text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>
              {demoLoading ? 'Signing in...' : 'Continue with Demo Account (Alex Morgan)'}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>

        <div className="relative my-5 flex items-center justify-center">
          <div className="border-t border-white/[0.06] w-full" />
          <span className="bg-[#111218] px-3 text-[10px] uppercase tracking-wider text-zinc-500">
            or credentials
          </span>
          <div className="border-t border-white/[0.06] w-full" />
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {isRegister && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    First Name
                  </label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Alex"
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Morgan"
                    className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Username <span className="text-zinc-500 font-normal">(optional, for quick sign-in)</span>
                </label>
                <div className="relative">
                  <span className="text-xs text-zinc-500 absolute left-3 top-2.5 font-mono">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
                    placeholder="alex"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              {isRegister ? 'Email Address' : 'Email or Username'}
            </label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type={isRegister ? 'email' : 'text'}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={isRegister ? 'alex@faisaa.io' : 'alex@faisaa.io or alex'}
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Base Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#161822] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="MVR">MVR — Maldivian Rufiyaa (Base)</option>
                <option value="USD">USD — US Dollar ($ Secondary)</option>
              </select>
            </div>
          )}

          <Button type="submit" loading={loading} className="w-full mt-2">
            {isRegister ? 'Create Account' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between text-xs text-zinc-400">
          <span>{isRegister ? 'Already have an account?' : 'New to Faisaa?'}</span>
          <Link
            to={isRegister ? '/login' : '/register'}
            className="text-indigo-400 hover:text-indigo-300 font-medium"
          >
            {isRegister ? 'Sign in →' : 'Create account →'}
          </Link>
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Encrypted session & multi-currency MVR/USD engine</span>
        </div>
      </div>
    </div>
  );
}
