'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { CheckCircle2, AlertCircle, Mail, ArrowRight, Loader2, RefreshCw } from 'lucide-react';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryToken = searchParams.get('token');

  const { user, updateUser } = useAuthStore();
  const [tokenInput, setTokenInput] = useState(queryToken || '');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<{ message: string; devUrl?: string } | null>(null);

  const performVerification = async (tok: string) => {
    if (!tok.trim()) return;
    setStatus('loading');
    setMessage('');
    try {
      const res = await authApi.verifyEmail(tok.trim());
      setStatus('success');
      setMessage(res.data?.message || 'メールアドレスの認証が完了しました！');
      if (user) {
        updateUser({ email_verified: true });
      }
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.response?.data?.error || '認証トークンが無効または期限切れです');
    }
  };

  useEffect(() => {
    if (queryToken) {
      performVerification(queryToken);
    }
  }, [queryToken]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performVerification(tokenInput);
  };

  const handleResend = async () => {
    setResending(true);
    setResendStatus(null);
    try {
      const res = await authApi.resendVerification(user?.email);
      setResendStatus({
        message: res.data?.message || '確認メールを送信しました',
        devUrl: res.data?.dev_verification_url,
      });
    } catch (err: any) {
      setResendStatus({
        message: err?.response?.data?.error || '再送に失敗しました',
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200/80 p-8 text-center">
        {status === 'loading' && (
          <div className="py-8 space-y-4">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto" />
            <h2 className="text-xl font-bold text-slate-800">メールアドレスを確認中...</h2>
            <p className="text-sm text-slate-500">トークンの妥当性を検証しています。少々お待ちください。</p>
          </div>
        )}

        {status === 'success' && (
          <div className="py-6 space-y-4">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">認証が完了しました！</h2>
            <p className="text-sm text-slate-600">
              {message}
              <br />
              これでKladosの全機能（サイト作成・公開・共同編集等）を制限なくご利用いただけます。
            </p>
            <div className="pt-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors shadow-sm"
              >
                <span>ダッシュボードへ進む</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="py-6 space-y-4">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <AlertCircle className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">認証に失敗しました</h2>
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl text-left">
              {message}
            </div>

            <p className="text-xs text-slate-500">
              リンクの有効期限（24時間）が切れているか、すでに認証が完了している可能性があります。確認メールを再送してください。
            </p>

            <div className="space-y-2 pt-2">
              <button
                onClick={handleResend}
                disabled={resending}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {resending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span>確認メールを再送する</span>
              </button>

              {resendStatus && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 text-left space-y-1">
                  <p className="font-semibold">{resendStatus.message}</p>
                  {resendStatus.devUrl && (
                    <a
                      href={resendStatus.devUrl}
                      className="block text-blue-600 underline break-all font-mono text-[11px] mt-1"
                    >
                      開発環境用クイック認証リンクを開く →
                    </a>
                  )}
                </div>
              )}

              <Link
                href="/dashboard"
                className="block text-xs text-slate-500 hover:text-slate-800 underline pt-2"
              >
                ダッシュボードへ戻る
              </Link>
            </div>
          </div>
        )}

        {status === 'idle' && (
          <div className="py-4 space-y-4">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
              <Mail className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">メールアドレス認証</h2>
            <p className="text-xs sm:text-sm text-slate-500">
              ご登録いただいたメールアドレス宛に認証トークン付きリンクをお送りしています。届いたトークンを入力するか、メールのリンクをクリックしてください。
            </p>

            <form onSubmit={handleManualSubmit} className="space-y-3 pt-2 text-left">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  認証トークン
                </label>
                <input
                  type="text"
                  required
                  placeholder="受信したトークンを貼り付け"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={!tokenInput.trim()}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                認証を実行する
              </button>
            </form>

            <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="text-xs text-blue-600 hover:underline inline-flex items-center justify-center gap-1"
              >
                {resending ? '送信中...' : '確認メールが届かない場合は再送する'}
              </button>

              {resendStatus && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 text-left space-y-1">
                  <p className="font-semibold">{resendStatus.message}</p>
                  {resendStatus.devUrl && (
                    <a
                      href={resendStatus.devUrl}
                      className="block text-blue-600 underline break-all font-mono text-[11px] mt-1"
                    >
                      開発環境用クイック認証リンクを開く →
                    </a>
                  )}
                </div>
              )}

              <Link
                href="/dashboard"
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                あとで認証する（ダッシュボードへ）
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">
          読み込み中...
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
