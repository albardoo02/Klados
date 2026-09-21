'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { authApi, AuthConfig } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { SocialLogin } from '@/components/social-login';
import { Eye, EyeOff, ShieldCheck, AlertTriangle, Lock } from 'lucide-react';

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ email: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [authMeta, setAuthMeta] = useState<{
    github_configured?: boolean;
    discord_configured?: boolean;
  } | null>(null);
  const [showAdminEmailForm, setShowAdminEmailForm] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('admin') === '1' || params.get('emergency') === '1' || params.get('root') === '1') {
        setShowAdminEmailForm(true);
      }
    }

    authApi.getAuthConfig()
      .then((res) => {
        setAuthConfig(res.data.data.config);
        setAuthMeta({
          github_configured: res.data.data.github_configured,
          discord_configured: res.data.data.discord_configured,
        });
      })
      .catch(() => {
        setAuthConfig(null);
        setAuthMeta(null);
      });
  }, []);

  // 有効かつ設定済みのOAuthが存在するか判定
  const hasActiveOauth = Boolean(
    (authConfig?.enable_github_login && authMeta?.github_configured) ||
    (authConfig?.enable_discord_login && authMeta?.discord_configured) ||
    authConfig?.enable_google_login
  );

  // もしOAuthがすべて未設定・利用不可の場合、管理者ロックアウトを防ぐため自動的にメールログインを開放
  const isEmergencyUnlocked = Boolean(authConfig && !hasActiveOauth);
  const enableEmail = (authConfig ? (authConfig.enable_email_login ?? true) : true) || isEmergencyUnlocked;
  const allowEmailRegister = authConfig ? (authConfig.allow_email_registration ?? true) : true;

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

        {/* 緊急ロックアウト解除バナー */}
        {isEmergencyUnlocked && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 mb-5 text-xs flex items-start gap-2.5 animate-in fade-in">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-amber-950">OAuth未設定による緊急脱出モード発動中</p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                GitHub / Discord の OAuth 接続情報が未設定です。管理者締め出しを防ぐ安全装置により、メールログインが一時開放されています。管理者アカウントでログインして設定を完了してください。
              </p>
            </div>
          </div>
        )}

        {/* ソーシャルログイン */}
        <SocialLogin
          mode="login"
          config={authConfig}
          showDivider={enableEmail || showAdminEmailForm}
          onError={(msg) => setError(msg)}
        />

        {/* メール・パスワードフォーム (有効時または管理者手動展開時に表示) */}
        {(enableEmail || showAdminEmailForm) ? (
          <form
            method="post"
            action="#"
            autoComplete="on"
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            {showAdminEmailForm && !enableEmail && (
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-blue-600" />
                  管理者(root)ログイン
                </span>
                <button
                  type="button"
                  onClick={() => setShowAdminEmailForm(false)}
                  className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  閉じる
                </button>
              </div>
            )}
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
        ) : (
          <div className="space-y-3 mt-3">
            <div className="p-3 bg-slate-100 rounded-xl text-center text-xs text-slate-500 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>関係者アカウント（Discord / GitHub）でログインしてください</span>
            </div>
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setShowAdminEmailForm(true)}
                className="text-xs text-slate-400 hover:text-slate-700 transition-colors inline-flex items-center gap-1 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                管理者(root)としてメールでログイン
              </button>
            </div>
          </div>
        )}

        {/* 新規登録への案内リンク (メールログイン＆登録許可時のみ表示) */}
        {enableEmail && allowEmailRegister ? (
          <p className="text-center text-sm text-slate-500 mt-4">
            {t('auth.login.no_account')}{' '}
            <Link href="/register" className="text-blue-500 hover:underline">
              {t('auth.login.register_link')}
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}

