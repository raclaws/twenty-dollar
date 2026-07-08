import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { useRouter, Link } from '@tanstack/react-router';
import { runInAction } from 'mobx';

export const LoginPage = observer(function LoginPage() {
  const rootStore = useStore();
  const { authStore } = rootStore;
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [validationError, setValidationError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setValidationError('Email and password are required.');
      return;
    }
    setValidationError('');
    setSubmitting(true);
    const success = await authStore.login(email, password);
    if (success) {
      // Trigger server hydration after fresh login
      runInAction(() => {
        (rootStore as any).isHydrating = true;
      });
      router.navigate({ to: '/budget' });
      rootStore.hydrateFromServer();
    }
    setSubmitting(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-zinc-100">Twenty Dollar</h1>
          <p className="mt-1 text-sm text-zinc-400">Sign in to your budget</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
          {(authStore.error || validationError) && (
            <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
              {validationError || authStore.error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm text-zinc-300 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-zinc-300 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
          >
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-500">
          First time?{' '}
          <Link to="/setup" className="text-indigo-400 hover:text-indigo-300">
            Set up your account
          </Link>
        </p>
      </div>
    </div>
  );
});
