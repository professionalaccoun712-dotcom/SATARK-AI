import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { UserProfile } from '../types.ts';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (user: UserProfile) => void;
}

export function AuthModal({ open, onClose, onAuthenticated }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const payload = mode === 'login' ? { email, password } : { name, email, password };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { user?: UserProfile; error?: string };
      if (!res.ok || !data.user) {
        throw new Error(data.error || 'Authentication failed.');
      }
      onAuthenticated(data.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-dialog-title"
    >
      <div className="w-full max-w-md rounded-xl border border-[#E3E5DF] bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="auth-dialog-title" className="font-display text-xl font-bold text-[#111C19]">
              {mode === 'signup' ? 'Create private account' : 'Sign in to Satark'}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[#525E59]">
              Sync your trusted guardians and PII-masked check history across sessions.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-[#525E59] hover:bg-[#F3F4F0] hover:text-[#111C19] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-1 rounded-lg bg-[#F1F3EE] p-1">
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setError(null);
            }}
            className={`rounded-md py-2 text-xs font-semibold transition-colors cursor-pointer ${
              mode === 'signup' ? 'bg-white text-[#111C19] shadow-xs' : 'text-[#525E59]'
            }`}
          >
            Create account
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`rounded-md py-2 text-xs font-semibold transition-colors cursor-pointer ${
              mode === 'login' ? 'bg-white text-[#111C19] shadow-xs' : 'text-[#525E59]'
            }`}
          >
            Sign in
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {mode === 'signup' && (
            <div>
              <label htmlFor="auth-name" className="block text-xs font-medium text-[#34403B]">
                Your name
              </label>
              <input
                id="auth-name"
                type="text"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ananya Sharma"
                className="mt-1 w-full rounded-lg border border-[#D4D8D0] px-3 py-2 text-sm text-[#111C19] focus:border-[#1B4332] focus:outline-none"
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-xs font-medium text-[#34403B]">
              Email address
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-lg border border-[#D4D8D0] px-3 py-2 text-sm text-[#111C19] focus:border-[#1B4332] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-xs font-medium text-[#34403B]">
              Password (min 8 characters)
            </label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D4D8D0] px-3 py-2 text-sm text-[#111C19] focus:border-[#1B4332] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-[#1B4332] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#143326] disabled:opacity-60 cursor-pointer"
          >
            {submitting
              ? 'Please wait...'
              : mode === 'signup'
                ? 'Create Account'
                : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
