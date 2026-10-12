import React, { useState } from 'react';
import { ShieldAlert, Lock, AlertCircle } from 'lucide-react';
import { Modal, Button, Input } from './ui';
import { useAuth } from '../context/AuthContext';

export interface StepUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  actionLabel?: string;
  onSuccess: (stepUpToken: string) => Promise<void> | void;
}

export function StepUpModal({
  isOpen,
  onClose,
  title = 'Security Verification',
  description = 'Confirm your account password to authorize this sensitive action.',
  actionLabel = 'Authorize Action',
  onSuccess,
}: StepUpModalProps) {
  const { stepUpAuth } = useAuth();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Password is required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const token = await stepUpAuth(password);
      setPassword('');
      await onSuccess(token);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Authentication failed. Please verify your password.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPassword('');
    setError('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      subtitle="Step-Up Authentication Required"
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-200">
          <ShieldAlert className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{description}</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Input
          label="Account Password"
          type="password"
          autoFocus
          required
          placeholder="••••••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          leftIcon={<Lock className="w-4 h-4" />}
        />

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button type="button" variant="secondary" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={loading}
            className="bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            {actionLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
