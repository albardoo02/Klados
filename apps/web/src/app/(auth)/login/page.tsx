'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { SocialLogin } from '@/components/social-login';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ email: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await authApi.login({ ...form, remember_me: rememberMe });
      setAuth(res.data.data.user, res.data.data.token, rememberMe);

      // ブラウザのパスワードマネージャーに「パスワードを保存しますか？」プロンプトをトリガー
      if (typeof window !== 'undefined' && 'PasswordCredential' in window && navigator.credentials?.store) {
        try {
          const cred = new (window as any).PasswordCredential({
            id: form.email,
            password: form.password,
            name: res.data.data.user?.display_name || form.email,
          });
          await navigator.credentials.store(cred);
        } catch {
          // ブラウザの拒否や非対応時はそのまま進行
        }
      }

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

        <form
          method="post"
          action="#"
          autoComplete="on"
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1 text-slate-700">
              {t('auth.email')}
            </label>
            <input
              id="email"
              name="username"
              type="email"
              required
              autoComplete="username"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              placeholder="name@example.com"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                {t('auth.password')}
              </label>
            </div>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                title={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 30日間ログイン保持 */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none group">
            <div className="relative">
              <input
                id="remember_me"
                name="remember_me"
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
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 font-bold transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
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
