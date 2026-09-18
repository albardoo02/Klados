'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useEffect, useState, useRef } from 'react';
import { CommandPalette } from '@/components/command-palette';
import {
  Search,
  KeyRound,
  LogOut,
  ExternalLink,
  Sparkles,
  User,
  ChevronDown,
  FolderKanban,
  Settings,
  AlertTriangle,
} from 'lucide-react';
import { authApi } from '@/lib/api';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, clearAuth } = useAuthStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  const handleResend = async () => {
    setResending(true);
    setResendStatus(null);
    try {
      const res = await authApi.resendVerification(user?.email);
      setResendStatus(res.data?.dev_verification_url || '確認メールを再送しました');
    } catch {
      setResendStatus('再送に失敗しました');
    } finally {
      setResending(false);
    }
  };

  useEffect(() => {
    if (!user) router.push('/login');
  }, [user, router]);

  // 外側クリックでメニューを閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    clearAuth();
    router.push('/login');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <nav className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-xl font-bold tracking-tight">
            Kla<span className="text-blue-600">dos</span>
          </Link>

          {/* グローバル検索バー (クリックまたは Ctrl+K で開く) */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-400 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-slate-300 w-56 md:w-72 justify-between"
          >
            <div className="flex items-center gap-2">
              <Search className="size-3.5 text-slate-400" />
              <span>検索またはコマンド...</span>
            </div>
            <kbd className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono rounded bg-white border border-slate-200 shadow-2xs text-slate-500">
              Ctrl K
            </kbd>
          </button>
        </div>

        <div className="flex items-center gap-4">
          {/* APIキー設定リンク */}
          <Link
            href="/dashboard/settings/api-keys"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              pathname === '/dashboard/settings/api-keys'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="開発者 API キーの管理"
          >
            <KeyRound className="size-3.5" />
            <span className="hidden md:inline">API キー</span>
          </Link>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          {/* ユーザーアバター & 個人設定ドロップダウン */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer border border-transparent hover:border-slate-200"
              aria-expanded={userMenuOpen}
              aria-haspopup="true"
            >
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.display_name || user.username}
                  className="size-8 rounded-full object-cover shadow-2xs border border-slate-200"
                />
              ) : (
                <div className="size-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-2xs">
                  {(user.display_name || user.username || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-semibold text-slate-800 leading-tight">
                  {user.display_name || user.username}
                </span>
                <span className="text-[10px] text-slate-400 capitalize">
                  {user.plan} プラン
                </span>
              </div>
              <ChevronDown className={`size-3.5 text-slate-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* ドロップダウンメニュー */}
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100 text-slate-800">
                {/* ユーザー情報ヘッダー */}
                <div className="px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={user.display_name || user.username}
                        className="size-9 rounded-full object-cover shadow-2xs border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="size-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
                        {(user.display_name || user.username || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {user.display_name || user.username}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-[11px] bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                    <span className="text-slate-500">ご利用プラン</span>
                    <span className="font-semibold text-blue-600 uppercase flex items-center gap-1">
                      <Sparkles className="size-2.5" />
                      {user.plan}
                    </span>
                  </div>
                </div>

                {/* メニューアイテム */}
                <div className="p-1.5 space-y-0.5 text-xs font-medium">
                  <Link
                    href="/dashboard/settings/profile"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-700 hover:text-slate-900"
                  >
                    <User className="size-4 text-blue-600" />
                    <div className="flex-1">
                      <span>個人設定 / プロフィール</span>
                      <span className="block text-[10px] text-slate-400 font-normal">表示名やパスワードの編集</span>
                    </div>
                  </Link>

                  <Link
                    href="/dashboard/settings/api-keys"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-700 hover:text-slate-900"
                  >
                    <KeyRound className="size-4 text-indigo-600" />
                    <div className="flex-1">
                      <span>開発者 API キー</span>
                      <span className="block text-[10px] text-slate-400 font-normal">API トークンの発行と管理</span>
                    </div>
                  </Link>

                  <Link
                    href="/dashboard"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-700 hover:text-slate-900"
                  >
                    <FolderKanban className="size-4 text-slate-500" />
                    <span>マイサイト一覧</span>
                  </Link>
                </div>

                {/* ログアウト */}
                <div className="pt-1.5 mt-1 border-t border-slate-100 p-1.5">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600 transition-colors text-xs font-medium cursor-pointer"
                  >
                    <LogOut className="size-4 text-rose-500" />
                    <span>ログアウト</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* メールアドレス未確認バナー */}
      {user && user.email_verified === false && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600 shrink-0" />
            <span>
              メールアドレス（<strong>{user.email}</strong>）の認証が完了していません。サイトの外部公開や設定変更を有効にするために認証を完了してください。
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/verify-email"
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
            >
              認証ページを開く
            </Link>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="px-2.5 py-1 bg-white hover:bg-amber-100/60 text-amber-800 border border-amber-300 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {resending ? '送信中...' : 'メールを再送'}
            </button>
            {resendStatus && (
              <span className="text-amber-700 font-mono text-[11px] truncate max-w-xs">
                {resendStatus.startsWith('http') ? (
                  <Link href={resendStatus} className="underline text-blue-600 font-bold ml-1">
                    クイック認証リンク →
                  </Link>
                ) : (
                  resendStatus
                )}
              </span>
            )}
          </div>
        </div>
      )}

      <main className="container mx-auto px-6 py-8">{children}</main>

      {/* グローバル コマンドパレット */}
      <CommandPalette isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
