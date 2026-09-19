'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { SocialLogin } from '@/components/social-login';

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ email: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await authApi.login({ ...form, remember_me: rememberMe });
      setAuth(res.data.data.user, res.data.data.token, rememberMe);
      router.push('/dashboard');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? t('auth.login.error_default'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200/80 p-8">
        <div className="text-center mb-6">
          <Link href="/" className="text-2xl font-black tracking-tight inline-block mb-1">
            Kla<span className="text-blue-600">dos</span>
          </Link>
          <h1 className="text-xl font-bold text-slate-900">{t('auth.login.title')}</h1>
          <p className="text-xs text-slate-500 mt-1">{t('brand.description')}</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 mb-5 text-xs">
            {error}
          </div>
        )}

        <SocialLogin mode="login" onError={(msg) => setError(msg)} />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('auth.email')}</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('auth.password')}</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 30日間ログイン保持 */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none group">
            <div className="relative">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-4 h-4 border-2 border-slate-300 rounded peer-checked:bg-blue-500 peer-checked:border-blue-500 transition-colors group-hover:border-blue-400 flex items-center justify-center">
                {rememberMe && (
                  <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
            </div>
            <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">
              {t('auth.login.remember_me')}
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-2 font-semibold transition-colors disabled:opacity-50"
          >
            {loading ? t('auth.login.submitting') : t('auth.login.submit')}
          </button>
        </form>
        <p className="text-center text-sm text-slate-500 mt-4">
          {t('auth.login.no_account')}{' '}
          <Link href="/register" className="text-blue-500 hover:underline">
            {t('auth.login.register_link')}
          </Link>
        </p>
      </div>
    </div>
  );
}
