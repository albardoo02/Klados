'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useEffect, useState, useRef } from 'react';
import { CommandPalette } from '@/components/command-palette';
import { LocaleSwitcher } from '@/components/locale-switcher';
import {
  Search,
  KeyRound,
  LogOut,
  User,
  ChevronDown,
  FolderKanban,
  Settings,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { authApi } from '@/lib/api';
import { UserAvatar } from '@/components/user-avatar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const { user, clearAuth, updateUser } = useAuthStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [quickVerifying, setQuickVerifying] = useState(false);

  const handleQuickVerify = async () => {
    setQuickVerifying(true);
    try {
      await authApi.quickVerify();
      if (user) {
        updateUser({ email_verified: true });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setQuickVerifying(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setResendStatus(null);
    try {
      const res = await authApi.resendVerification(user?.email);
      setResendStatus(res.data?.dev_verification_url || t('email_banner.resend_button'));
    } catch {
      setResendStatus(t('email_banner.resend_failed'));
    } finally {
      setResending(false);
    }
  };

  useEffect(() => {
    if (!user) router.push('/login');
  }, [user, router]);

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

          {/* グローバル検索バー */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-400 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-slate-300 w-56 md:w-72 justify-between"
          >
            <div className="flex items-center gap-2">
              <Search className="size-3.5 text-slate-400" />
              <span>{t('nav.search_placeholder')}</span>
            </div>
            <kbd className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono rounded bg-white border border-slate-200 shadow-2xs text-slate-500">
              Ctrl K
            </kbd>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* 言語切り替え */}
          <LocaleSwitcher />

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          {/* 認証・振り分け設定リンク */}
          <Link
            href="/dashboard/settings/auth"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              pathname === '/dashboard/settings/auth'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="認証・アクセス振り分け設定"
          >
            <ShieldCheck className="size-3.5" />
            <span className="hidden md:inline">認証・SSO</span>
          </Link>

          {/* APIキー設定リンク */}
          <Link
            href="/dashboard/settings/api-keys"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              pathname === '/dashboard/settings/api-keys'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title={t('nav.api_keys_menu_title')}
          >
            <KeyRound className="size-3.5" />
            <span className="hidden md:inline">{t('nav.api_keys')}</span>
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
              <UserAvatar
                src={user.avatar_url}
                name={user.display_name || user.username}
                size="sm"
              />
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-semibold text-slate-800 leading-tight">
                  {user.display_name || user.username}
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
                    <UserAvatar
                      src={user.avatar_url}
                      name={user.display_name || user.username}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {user.display_name || user.username}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {user.email}
                      </p>
                    </div>
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
                      <span>{t('nav.profile_menu_title')}</span>
                      <span className="block text-[10px] text-slate-400 font-normal">{t('nav.profile_menu_desc')}</span>
                    </div>
                  </Link>

                  <Link
                    href="/dashboard/settings/auth"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-700 hover:text-slate-900"
                  >
                    <ShieldCheck className="size-4 text-emerald-600" />
                    <div className="flex-1">
                      <span>認証 & 振り分け設定</span>
                      <span className="block text-[10px] text-slate-400 font-normal">メール確認・GitHub/Discord自動所属</span>
                    </div>
                  </Link>

                  <Link
                    href="/dashboard/settings/api-keys"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-700 hover:text-slate-900"
                  >
                    <KeyRound className="size-4 text-indigo-600" />
                    <div className="flex-1">
                      <span>{t('nav.api_keys_menu_title')}</span>
                      <span className="block text-[10px] text-slate-400 font-normal">{t('nav.api_keys_menu_desc')}</span>
                    </div>
                  </Link>

                  <Link
                    href="/dashboard"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-700 hover:text-slate-900"
                  >
                    <FolderKanban className="size-4 text-slate-500" />
                    <span>{t('nav.my_sites')}</span>
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
                    <span>{t('nav.logout')}</span>
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
              {t('email_banner.message', { email: user.email })}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleQuickVerify}
              disabled={quickVerifying}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition-colors flex items-center gap-1 shadow-2xs disabled:opacity-50"
              title="メールサーバー設定不要でワンクリックで認証済みにします"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>今すぐ認証完了（メール不要）</span>
            </button>
            <Link
              href="/verify-email"
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
            >
              {t('email_banner.verify_button')}
            </Link>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="px-2.5 py-1 bg-white hover:bg-amber-100/60 text-amber-800 border border-amber-300 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {resending ? t('email_banner.resending') : t('email_banner.resend_button')}
            </button>
            {resendStatus && (
              <span className="text-amber-700 font-mono text-[11px] truncate max-w-xs">
                {resendStatus.startsWith('http') ? (
                  <Link href={resendStatus} className="underline text-blue-600 font-bold ml-1">
                    {t('email_banner.quick_link')}
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
