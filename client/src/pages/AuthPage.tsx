import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Mail, Lock, User, ArrowRight, ShieldCheck, KeyRound, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Button, Modal } from '../components/ui';

export default function AuthPage() {
  const location = useLocation();
  const isRegister = location.pathname === '/register';
  const navigate = useNavigate();
  const { login, register, verifyOtp, addToast } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currency, setCurrency] = useState('MVR');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState('');

  // OTP 2FA State
  const [otpStep, setOtpStep] = useState(false);
  const [otpUserId, setOtpUserId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpNotice, setOtpNotice] = useState('');
  const [otpSimulationCode, setOtpSimulationCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(true);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');

  // Forgot Password State
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<'REQUEST' | 'CONFIRM'>('REQUEST');
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotNotice, setForgotNotice] = useState('');
  const [forgotDevCode, setForgotDevCode] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
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
        navigate('/');
      } else {
        const res = await login(email, password);
        if (res?.requiresOtp) {
          setOtpUserId(res.userId || '');
          setOtpNotice(res.message || 'Security verification required.');
          setOtpSimulationCode(res.simulationOtp || '');
          setOtpStep(true);
          return;
        }
        navigate('/');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError('');
    setDemoLoading(true);
    try {
      let res: any;
      try {
        res = await login('alex', 'Password123!');
      } catch {
        try {
          res = await login('alex@faisaa.online', 'Password123!');
        } catch {
          res = await login('alex@faisaa.io', 'Password123!');
        }
      }
      if (res?.requiresOtp) {
        setOtpUserId(res.userId || '');
        setOtpNotice(res.message || 'Security verification required.');
        setOtpSimulationCode(res.simulationOtp || '');
        setOtpStep(true);
        return;
      }
      navigate('/');
    } catch {
      setError('Could not sign in to demo account.');
    } finally {
      setDemoLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError('');
    setOtpLoading(true);
    try {
      await verifyOtp(otpUserId, otpCode.trim(), trustDevice, 30);
      navigate('/');
    } catch (err: any) {
      setOtpError(err.response?.data?.message || 'Invalid or expired OTP code.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    setForgotNotice('');
    setForgotLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password', {
        identifier: forgotIdentifier.trim(),
      });
      setForgotNotice(data.message || 'Verification code dispatched.');
      if (data.devCode) {
        setForgotDevCode(data.devCode);
      }
      setForgotStep('CONFIRM');
    } catch (err: any) {
      setForgotError(err.response?.data?.message || 'Failed to request password reset code.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');
    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError('New passwords do not match.');
      return;
    }
    setForgotLoading(true);
    try {
      const { data } = await api.post('/auth/reset-password', {
        identifier: forgotIdentifier.trim(),
        code: forgotCode.trim(),
        newPassword: forgotNewPassword,
      });
      setForgotSuccess(data.message || 'Password reset successfully!');
      setEmail(forgotIdentifier);
      addToast('Password reset successfully! Please sign in with your new password.', 'success');
      setTimeout(() => {
        setForgotOpen(false);
        setForgotStep('REQUEST');
        setForgotCode('');
        setForgotNewPassword('');
        setForgotConfirmPassword('');
        setForgotSuccess('');
        setForgotError('');
        setForgotNotice('');
        setForgotDevCode('');
      }, 1500);
    } catch (err: any) {
      setForgotError(err.response?.data?.message || 'Failed to reset password. Please check your code.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#090A0F] text-zinc-900 dark:text-white flex items-center justify-center p-3.5 sm:p-8 transition-colors">
      <div className="faisaa-card finora-card w-full max-w-md bg-white dark:bg-[#111218] border border-black/10 dark:border-white/[0.08] rounded-2xl p-5 sm:p-8 shadow-xl dark:shadow-2xl">
        {/* Brand */}
        <div className="flex items-center justify-between mb-5 sm:mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-md shadow-indigo-600/30">
              F
            </div>
            <span className="text-lg font-bold tracking-tight font-display text-zinc-900 dark:text-white">Faisaa</span>
          </div>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-black/5 dark:bg-white/[0.05] text-zinc-600 dark:text-zinc-400">
            MVR & USD
          </span>
        </div>

        {otpStep ? (
          <div>
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-3.5">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">
              Two-Factor Authentication
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
              {otpNotice || 'Enter the 6-digit one-time passcode generated for your session.'}
            </p>

            {otpSimulationCode && (
              <div className="my-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-2">
                <div>
                  <span className="font-semibold block text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Security Passcode (TOTP)
                  </span>
                  <span className="font-mono text-sm tracking-widest font-bold">{otpSimulationCode}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setOtpCode(otpSimulationCode)}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                >
                  Auto-fill
                </button>
              </div>
            )}

            {otpError && (
              <div className="my-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-300">
                {otpError}
              </div>
            )}

            <form onSubmit={handleVerifyOtp} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-400 mb-1">
                  6-Digit Verification Code
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-zinc-400 dark:text-zinc-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    maxLength={6}
                    autoFocus
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/[0.08] text-base font-mono tracking-[0.3em] text-center text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/[0.04]">
                <input
                  type="checkbox"
                  id="trustDevice"
                  checked={trustDevice}
                  onChange={(e) => setTrustDevice(e.target.checked)}
                  className="mt-0.5 rounded border-black/20 dark:border-white/20 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="trustDevice" className="text-xs text-zinc-600 dark:text-zinc-300 select-none cursor-pointer">
                  <span className="font-medium text-zinc-900 dark:text-white block">Trust this device for 30 days</span>
                  Skip two-factor OTP challenges on this browser for the next 30 days.
                </label>
              </div>

              <Button
                type="submit"
                loading={otpLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-medium text-xs"
              >
                Verify & Continue
              </Button>

              <button
                type="button"
                onClick={() => {
                  setOtpStep(false);
                  setOtpCode('');
                  setOtpError('');
                }}
                className="w-full text-center text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer pt-1"
              >
                ← Back to sign in
              </button>
            </form>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">
              {isRegister ? 'Create your account' : 'Sign in to Faisaa'}
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
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
            className="w-full py-2.5 px-4 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] hover:bg-black/[0.06] dark:hover:bg-white/[0.09] border border-black/10 dark:border-white/[0.08] text-zinc-900 dark:text-white text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>
              {demoLoading ? 'Signing in...' : 'Continue with Demo Account (Alex Morgan)'}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>

        <div className="relative my-5 flex items-center justify-center">
          <div className="border-t border-black/10 dark:border-white/[0.06] w-full" />
          <span className="bg-white dark:bg-[#111218] px-3 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            or credentials
          </span>
          <div className="border-t border-black/10 dark:border-white/[0.06] w-full" />
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {isRegister && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-400 mb-1">
                    First Name
                  </label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Alex"
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/[0.08] text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-400 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Morgan"
                    className="w-full px-3 py-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/[0.08] text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-400 mb-1">
                  Username <span className="text-zinc-400 dark:text-zinc-500 font-normal">(optional, for quick sign-in)</span>
                </label>
                <div className="relative">
                  <span className="text-xs text-zinc-400 dark:text-zinc-500 absolute left-3 top-2.5 font-mono">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
                    placeholder="alex"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/[0.08] text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-400 mb-1">
              {isRegister ? 'Email Address' : 'Email or Username'}
            </label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 absolute left-3 top-2.5" />
              <input
                type={isRegister ? 'email' : 'text'}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={isRegister ? 'alex@faisaa.online' : 'alex@faisaa.online or alex'}
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/[0.08] text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-400">
                Password
              </label>
              {!isRegister && (
                <button
                  type="button"
                  onClick={() => {
                    setForgotOpen(true);
                    setForgotStep('REQUEST');
                    setForgotIdentifier(email || '');
                    setForgotError('');
                    setForgotSuccess('');
                    setForgotNotice('');
                    setForgotDevCode('');
                  }}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors font-medium cursor-pointer"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                minLength={isRegister ? 10 : 1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isRegister ? 'At least 10 characters (e.g. Strong@2026)' : '••••••••'}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/[0.08] text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50"
              />
            </div>
            {isRegister && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 leading-tight">
                Must be at least 10 characters and include uppercase, lowercase, number, and symbol.
              </p>
            )}
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-400 mb-1">
                Base Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#111218] border border-black/10 dark:border-white/[0.08] text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500/50"
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

        <div className="mt-5 pt-4 border-t border-black/10 dark:border-white/[0.06] flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span>{isRegister ? 'Already have an account?' : 'New to Faisaa?'}</span>
          <Link
            to={isRegister ? '/login' : '/register'}
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-medium"
          >
            {isRegister ? 'Sign in →' : 'Create account →'}
          </Link>
        </div>
      </>
    )}

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Encrypted session & multi-currency MVR/USD engine</span>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <Modal
        isOpen={forgotOpen}
        onClose={() => {
          if (!forgotLoading) {
            setForgotOpen(false);
            setForgotError('');
            setForgotSuccess('');
          }
        }}
        title="Reset Password"
        subtitle="Recover your account using a secure 6-digit verification code."
        maxWidth="max-w-md"
      >
        {forgotStep === 'REQUEST' ? (
          <form onSubmit={handleRequestReset} className="space-y-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Enter your registered email address or username. A 6-digit verification code will be generated and dispatched to your linked Telegram account or system notifications.
            </p>

            {forgotError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-300">
                {forgotError}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-400 mb-1">
                Email or Username
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={forgotIdentifier}
                  onChange={(e) => setForgotIdentifier(e.target.value)}
                  placeholder="alex@faisaa.online or alex"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/[0.08] text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setForgotOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                loading={forgotLoading}
                className="bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                Send Verification Code
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleConfirmReset} className="space-y-3.5">
            {forgotNotice && (
              <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-600 dark:text-indigo-300 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-indigo-700 dark:text-indigo-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span>Code Generated</span>
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300">{forgotNotice}</p>
                {forgotDevCode && (
                  <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold mt-1">
                    Demo/Dev Verification Code: {forgotDevCode}
                  </p>
                )}
              </div>
            )}

            {forgotError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-300">
                {forgotError}
              </div>
            )}

            {forgotSuccess && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-300">
                {forgotSuccess}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-400 mb-1">
                6-Digit Verification Code
              </label>
              <div className="relative">
                <KeyRound className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={forgotCode}
                  onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/[0.08] text-xs font-mono tracking-widest text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-400 mb-1">
                New Password
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  minLength={10}
                  value={forgotNewPassword}
                  onChange={(e) => setForgotNewPassword(e.target.value)}
                  placeholder="At least 10 characters (e.g. Strong@2026)"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/[0.08] text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50"
                />
              </div>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
                Must include uppercase, lowercase, number, and special character.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-400 mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  minLength={10}
                  value={forgotConfirmPassword}
                  onChange={(e) => setForgotConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/[0.08] text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setForgotStep('REQUEST');
                  setForgotError('');
                }}
                className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                ← Back
              </button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setForgotOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  loading={forgotLoading}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  Set New Password
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
