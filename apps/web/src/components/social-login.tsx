'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Sparkles, Loader2, ArrowRight } from 'lucide-react';

interface SocialLoginProps {
  mode?: 'login' | 'register';
  onError?: (msg: string) => void;
}

export function SocialLogin({ mode = 'login', onError }: SocialLoginProps) {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [showCustomModal, setShowCustomModal] = useState<'google' | 'github' | null>(null);
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');

  const handleDemoLogin = async () => {
    setLoadingType('demo');
    try {
      const res = await authApi.demoLogin();
      setAuth(res.data.data.user, res.data.data.token);
      router.push('/dashboard');
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'デモログインに失敗しました';
      onError?.(msg);
      setLoadingType(null);
    }
  };

  const handleOAuthLogin = async (provider: 'google' | 'github', email?: string, name?: string) => {
    setLoadingType(provider);
    setShowCustomModal(null);
    try {
      const apiFn = provider === 'google' ? authApi.googleLogin : authApi.githubLogin;
      const res = await apiFn({
        email: email || undefined,
        name: name || undefined,
      });
      setAuth(res.data.data.user, res.data.data.token);
      router.push('/dashboard');
    } catch (err: any) {
      const msg = err?.response?.data?.error || `${provider} ログインに失敗しました`;
      onError?.(msg);
      setLoadingType(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* ワンクリック簡単ログイン (登録不要のデモ体験) */}
      <button
        type="button"
        onClick={handleDemoLogin}
        disabled={loadingType !== null}
        className="w-full relative group overflow-hidden rounded-xl p-[1px] focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm hover:shadow-md active:scale-[0.99]"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-xl transition-all group-hover:opacity-90" />
        <div className="relative px-4 py-3 bg-white dark:bg-slate-900 rounded-[11px] flex items-center justify-between transition-colors group-hover:bg-opacity-95">
          <div className="flex items-center gap-3 text-left">
            <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-lg shadow-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>ワンクリック簡単ログイン</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium">
                  登録不要
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                サンプルサイト付きで今すぐKladosを体験
              </p>
            </div>
          </div>
          {loadingType === 'demo' ? (
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
          ) : (
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
          )}
        </div>
      </button>

      {/* ソーシャルログインボタン群 */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Googleログイン */}
        <button
          type="button"
          onClick={() => handleOAuthLogin('google')}
          disabled={loadingType !== null}
          className="flex items-center justify-center gap-2.5 px-3.5 py-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium transition-colors shadow-2xs hover:border-slate-300 disabled:opacity-50"
        >
          {loadingType === 'google' ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          ) : (
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
          )}
          <span>Google</span>
        </button>

        {/* GitHubログイン */}
        <button
          type="button"
          onClick={() => handleOAuthLogin('github')}
          disabled={loadingType !== null}
          className="flex items-center justify-center gap-2.5 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-colors shadow-2xs disabled:opacity-50"
        >
          {loadingType === 'github' ? (
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          ) : (
            <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          )}
          <span>GitHub</span>
        </button>
      </div>

      {/* 区切り線 */}
      <div className="relative flex items-center justify-center my-4">
        <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
        <span className="bg-white dark:bg-slate-900 px-3 text-[11px] text-slate-400 absolute">
          またはメールアドレスで{mode === 'login' ? 'ログイン' : '新規登録'}
        </span>
      </div>
    </div>
  );
}
