'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { SocialLogin } from '@/components/social-login';
import { Eye, EyeOff } from 'lucide-react';

export default function RegisterPage() {
  const t = useTranslations();
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ email: '', username: '', password: '', display_name: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await authApi.register(form);
      setAuth(res.data.data.user, res.data.data.token);

      // ブラウザのパスワードマネージャーに「パスワードを保存しますか？」プロンプトをトリガー
      if (typeof window !== 'undefined' && 'PasswordCredential' in window && navigator.credentials?.store) {
        try {
          const cred = new (window as any).PasswordCredential({
            id: form.email,
            password: form.password,
            name: form.display_name || form.username || form.email,
          });
          await navigator.credentials.store(cred);
        } catch {
          // ブラウザの拒否や非対応時はそのまま進行
        }
      }

      router.push('/dashboard');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? t('auth.register.error_default'));
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
          <h1 className="text-xl font-bold text-slate-900">{t('auth.register.title')}</h1>
          <p className="text-xs text-slate-500 mt-1">{t('auth.register.subtitle')}</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 mb-5 text-xs">
            {error}
          </div>
        )}

        <SocialLogin mode="register" onError={(msg) => setError(msg)} />

        <form
          method="post"
          action="#"
          autoComplete="on"
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div>
            <label htmlFor="reg-display-name" className="block text-sm font-medium mb-1 text-slate-700">
              {t('auth.display_name')}
            </label>
            <input
              id="reg-display-name"
              name="name"
              type="text"
              autoComplete="name"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              placeholder="山田 太郎"
            />
          </div>

          <div>
            <label htmlFor="reg-username" className="block text-sm font-medium mb-1 text-slate-700">
              {t('auth.username')}
            </label>
            <input
              id="reg-username"
              name="nickname"
              type="text"
              required
              autoComplete="username"
              pattern="[a-zA-Z0-9_-]{3,30}"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              placeholder="yamada_taro"
            />
          </div>

          <div>
            <label htmlFor="reg-email" className="block text-sm font-medium mb-1 text-slate-700">
              {t('auth.email')}
            </label>
            <input
              id="reg-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              placeholder="name@example.com"
            />
          </div>

          <div>
            <label htmlFor="reg-password" className="block text-sm font-medium mb-1 text-slate-700">
              {t('auth.register.password_hint')}
            </label>
            <div className="relative">
              <input
                id="reg-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                placeholder="•••••••• (8文字以上)"
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

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 font-bold transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
          >
            {loading ? t('auth.register.submitting') : t('auth.register.submit')}
          </button>
        </form>
        <p className="text-center text-sm text-slate-500 mt-4">
          {t('auth.register.already_have_account')}{' '}
          <Link href="/login" className="text-blue-500 hover:underline">
            {t('auth.register.login_link')}
          </Link>
        </p>
      </div>
    </div>
  );
}
