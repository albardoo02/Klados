'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { authApi, AuthConfig } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { SocialLogin } from '@/components/social-login';
import { Eye, EyeOff, ShieldAlert, ArrowLeft } from 'lucide-react';

export default function RegisterPage() {
  const t = useTranslations();
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ email: '', username: '', password: '', display_name: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);

  useEffect(() => {
    authApi.getAuthConfig()
      .then((res) => setAuthConfig(res.data.data.config))
      .catch(() => setAuthConfig(null));
  }, []);

  const allowEmailRegister = authConfig ? (authConfig.allow_email_registration ?? true) : true;
  const enableEmail = authConfig ? (authConfig.enable_email_login ?? true) : true;
  const isEmailRegistrationAvailable = allowEmailRegister && enableEmail;

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
          <p className="text-xs text-slate-500 mt-1">
            {isEmailRegistrationAvailable ? t('auth.register.subtitle') : '本Wikiは関係者限定の認証システムです'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 mb-5 text-xs">
            {error}
          </div>
        )}

        {/* メール登録が無効化されている場合の関係者向け案内 */}
        {!isEmailRegistrationAvailable && (
          <div className="mb-5 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-amber-800">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>関係者認証（Discord / GitHub）をご利用ください</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-700">
              一般のメール登録は制限されています。所属組織のGitHubまたは公式Discordアカウントでログインしてください。自動的にアカウント作成および所属サイトのアクセス権が付与されます。
            </p>
          </div>
        )}

        {/* ソーシャルログイン */}
        <SocialLogin
          mode="register"
          config={authConfig}
          showDivider={isEmailRegistrationAvailable}
          onError={(msg) => setError(msg)}
        />

        {/* メール登録フォーム (有効時のみ表示) */}
        {isEmailRegistrationAvailable ? (
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
                placeholder={authConfig?.allowed_domains ? `name${authConfig.allowed_domains.split(',')[0].trim().startsWith('@') ? '' : '@'}${authConfig.allowed_domains.split(',')[0].trim()}` : "name@example.com"}
              />
              {authConfig?.allowed_domains && (
                <p className="text-[10px] text-slate-400 mt-1">
                  ※ 許可ドメイン: {authConfig.allowed_domains}
                </p>
              )}
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
        ) : null}

        <p className="text-center text-sm text-slate-500 mt-4">
          <Link href="/login" className="text-blue-500 hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('auth.register.login_link')}へ戻る
          </Link>
        </p>
      </div>
    </div>
  );
}

