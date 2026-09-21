'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Loader2, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth } = useAuthStore();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [providerName, setProviderName] = useState<string>('OAuth');

  const executedRef = useRef(false);

  useEffect(() => {
    if (executedRef.current) return;
    executedRef.current = true;

    // 1. エラーパラメータの検査
    const errorParam = searchParams.get('error_description') || searchParams.get('error') || '';
    if (errorParam) {
      setStatus('error');
      setErrorMessage(
        errorParam === 'access_denied'
          ? '認証がキャンセルされました。'
          : `認証プロバイダーからエラーが返されました: ${errorParam}`
      );
      return;
    }

    // 2. ワンタイム・リレーチケットの受け取り (別ドメインからのリレー認証)
    const ticket = searchParams.get('ticket') || searchParams.get('relay_ticket');
    const returnToParam = searchParams.get('return_to') || '';

    if (ticket) {
      setProviderName('Klados Relay');
      authApi
        .exchangeRelayTicket(ticket)
        .then((res) => {
          const { user, token } = res.data.data;
          setStatus('success');
          setAuth(user, token);

          // 遷移先の解決
          let targetPath = '/dashboard';
          if (returnToParam) {
            try {
              const urlObj = new URL(returnToParam, window.location.origin);
              if (urlObj.origin === window.location.origin) {
                targetPath = urlObj.pathname + urlObj.search + urlObj.hash;
                if (
                  targetPath.startsWith('/login') ||
                  targetPath.startsWith('/auth/callback') ||
                  targetPath.startsWith('/callback')
                ) {
                  targetPath = '/dashboard';
                }
              }
            } catch {
              if (
                returnToParam.startsWith('/') &&
                !returnToParam.startsWith('/login') &&
                !returnToParam.startsWith('/auth/callback') &&
                !returnToParam.startsWith('/callback')
              ) {
                targetPath = returnToParam;
              }
            }
          }

          setTimeout(() => {
            router.replace(targetPath);
          }, 600);
        })
        .catch((err: any) => {
          setStatus('error');
          setErrorMessage(
            err?.response?.data?.error ||
            err?.message ||
            'リレー認証チケットの検証に失敗しました。もう一度ログインをお試しください。'
          );
        });
      return;
    }

    // 3. OAuthプロバイダーからの直接コールバック（GitHub / Discord等）
    const provider = searchParams.get('provider') || '';
    const code = searchParams.get('code') || '';
    const stateParam = searchParams.get('state') || '';

    setProviderName(provider === 'github' ? 'GitHub' : provider === 'discord' ? 'Discord' : 'OAuth');

    if (!code || !provider) {
      setStatus('error');
      setErrorMessage('無効なコールバックURLです。認可コード（code）またはプロバイダー情報が見つかりません。');
      return;
    }

    // stateから元のアクセス元（return_to）を復元
    let returnTo: string | undefined = undefined;
    if (stateParam) {
      try {
        let b64 = stateParam.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const parsed = JSON.parse(atob(b64));
        if (parsed && typeof parsed === 'object') {
          returnTo = parsed.r || parsed.return_to;
        }
      } catch {
        // stateがプレーンUUID等の場合は無視
      }
    }

    // 実際にブラウザがリダイレクトされたパス（/auth/callback または /callback）に合わせて redirect_uri を構成
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/callback';
    const redirectUri = `${window.location.origin}${currentPath}?provider=${provider}`;

    authApi
      .oauthCallback({
        provider,
        code,
        redirect_uri: redirectUri,
        return_to: returnTo,
      })
      .then((res) => {
        const { user, token, relay_target } = res.data.data;

        // 別ドメインへの集中型リレーが必要な場合、直ちにリレー先URLへブラウザを遷移
        if (relay_target) {
          window.location.replace(relay_target);
          return;
        }

        // 同一ドメイン上でのログイン完了
        setStatus('success');
        setAuth(user, token);

        let targetPath = '/dashboard';
        if (returnTo) {
          try {
            const urlObj = new URL(returnTo, window.location.origin);
            if (urlObj.origin === window.location.origin) {
              targetPath = urlObj.pathname + urlObj.search + urlObj.hash;
              if (
                targetPath.startsWith('/login') ||
                targetPath.startsWith('/auth/callback') ||
                targetPath.startsWith('/callback')
              ) {
                targetPath = '/dashboard';
              }
            }
          } catch {
            if (returnTo.startsWith('/') && !returnTo.startsWith('/login')) {
              targetPath = returnTo;
            }
          }
        }

        setTimeout(() => {
          router.replace(targetPath);
        }, 800);
      })
      .catch((err: any) => {
        setStatus('error');
        const msg =
          err?.response?.data?.error ||
          err?.message ||
          'アカウント情報の検証またはトークンの取得に失敗しました。';
        setErrorMessage(msg);
      });
  }, [searchParams, router, setAuth]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-6 animate-in fade-in-0 zoom-in-95 duration-200">
        {status === 'loading' && (
          <div className="space-y-4 py-6">
            <div className="size-16 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200/80 dark:border-blue-800/60 flex items-center justify-center mx-auto shadow-inner">
              <Loader2 className="size-8 animate-spin" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {providerName} でログイン中...
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                アカウント情報と所属組織・権限を照合しています。少々お待ちください。
              </p>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4 py-6">
            <div className="size-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="size-8" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">認証完了</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ダッシュボードへ移動しています...
              </p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-5 py-4">
            <div className="size-16 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200/80 dark:border-rose-800/60 flex items-center justify-center mx-auto shadow-inner">
              <AlertCircle className="size-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">ログインに失敗しました</h2>
              <div className="p-3.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-left">
                <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">エラー詳細:</p>
                <p className="text-xs text-rose-700 dark:text-rose-400 mt-1 break-words leading-relaxed">
                  {errorMessage}
                </p>
              </div>
            </div>

            <div className="pt-2">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-sm font-semibold transition-colors cursor-pointer"
              >
                <ArrowLeft className="size-4" />
                <span>ログイン画面に戻る</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
          <div className="size-10 text-blue-600 animate-spin flex items-center justify-center">
            <Loader2 className="size-8" />
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
