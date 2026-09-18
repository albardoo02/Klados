'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useEffect, useState } from 'react';
import { CommandPalette } from '@/components/command-palette';
import { Search, KeyRound, LogOut, ExternalLink, Sparkles } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, clearAuth } = useAuthStore();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (!user) router.push('/login');
  }, [user, router]);

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

          <div className="flex items-center gap-2">
            <div className="size-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shadow-2xs">
              {(user.display_name || user.username || 'U').charAt(0).toUpperCase()}
            </div>
            <span className="text-xs font-medium text-slate-700 hidden sm:inline">
              {user.display_name || user.username}
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600 transition-colors p-1.5 rounded-lg hover:bg-rose-50 cursor-pointer"
            title="ログアウト"
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">ログアウト</span>
          </button>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-8">{children}</main>

      {/* グローバル コマンドパレット */}
      <CommandPalette isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
