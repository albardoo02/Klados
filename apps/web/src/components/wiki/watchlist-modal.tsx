'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Star, X, Search, Trash2, ArrowRight, BookOpen } from 'lucide-react';
import { getSitePageHref } from '@/lib/site-url';

export interface WatchlistItem {
  id: string;
  slug: string;
  title: string;
  starredAt: string;
}

interface WatchlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteSlug: string;
  onSelectPage?: () => void;
  onWatchlistChange?: () => void;
}

export function getWatchlist(siteSlug: string): WatchlistItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`klados_watchlist_${siteSlug}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return [];
}

export function addToWatchlist(siteSlug: string, item: { id: string; slug: string; title: string }) {
  if (typeof window === 'undefined') return;
  const list = getWatchlist(siteSlug);
  const cleanSlug = item.slug || 'index';
  if (!list.some((it) => (it.slug || 'index') === cleanSlug)) {
    list.unshift({
      id: item.id,
      slug: cleanSlug,
      title: item.title || cleanSlug,
      starredAt: new Date().toISOString(),
    });
    localStorage.setItem(`klados_watchlist_${siteSlug}`, JSON.stringify(list));
  }
  localStorage.setItem(`klados_star_${siteSlug}_${cleanSlug}`, 'true');
}

export function removeFromWatchlist(siteSlug: string, slug: string) {
  if (typeof window === 'undefined') return;
  const cleanSlug = slug || 'index';
  const list = getWatchlist(siteSlug).filter((it) => (it.slug || 'index') !== cleanSlug);
  localStorage.setItem(`klados_watchlist_${siteSlug}`, JSON.stringify(list));
  localStorage.removeItem(`klados_star_${siteSlug}_${cleanSlug}`);
}

export function isPageInWatchlist(siteSlug: string, slug: string): boolean {
  if (typeof window === 'undefined') return false;
  const cleanSlug = slug || 'index';
  return localStorage.getItem(`klados_star_${siteSlug}_${cleanSlug}`) === 'true';
}

export function WatchlistModal({
  isOpen,
  onClose,
  siteSlug,
  onSelectPage,
  onWatchlistChange,
}: WatchlistModalProps) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [search, setSearch] = useState('');

  const reloadItems = () => {
    setItems(getWatchlist(siteSlug));
  };

  useEffect(() => {
    if (isOpen) {
      reloadItems();
      setSearch('');
    }
  }, [isOpen, siteSlug]);

  if (!isOpen) return null;

  const handleRemove = (slug: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    removeFromWatchlist(siteSlug, slug);
    reloadItems();
    onWatchlistChange?.();
  };

  const handleClearAll = () => {
    if (confirm('お気に入り（ウォッチリスト）をすべてクリアしますか？')) {
      for (const it of items) {
        removeFromWatchlist(siteSlug, it.slug);
      }
      reloadItems();
      onWatchlistChange?.();
    }
  };

  const filtered = items.filter(
    (it) =>
      it.title.toLowerCase().includes(search.toLowerCase()) ||
      it.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in-0 zoom-in-95 duration-150">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-500 border border-amber-200 dark:border-amber-800/60">
              <Star className="size-4 fill-amber-400" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                お気に入り一覧 (ウォッチリスト)
              </h3>
              <p className="text-xs text-slate-400">
                このサイトでスターを付けたページの一覧 ({items.length} 件)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* 検索バー */}
        {items.length > 0 && (
          <div className="px-6 pt-4 pb-2 shrink-0">
            <div className="relative">
              <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="お気に入り内を検索..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </div>
          </div>
        )}

        {/* リスト */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {items.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl">
              <Star className="size-10 stroke-[1.2] mx-auto text-slate-300 dark:text-slate-700" />
              <p className="font-semibold text-sm text-slate-600 dark:text-slate-400">
                お気に入りに追加されたページはありません
              </p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                各ページの右上にある「☆」アイコンをクリックすると、いつでもここから素早くアクセスできます。
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              検索条件に一致するページは見つかりませんでした
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((item) => (
                <Link
                  key={item.slug}
                  href={getSitePageHref(siteSlug, item.slug)}
                  onClick={() => {
                    onSelectPage?.();
                    onClose();
                  }}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-850 hover:bg-amber-50/60 dark:hover:bg-amber-950/20 hover:border-amber-200 dark:hover:border-amber-800/60 transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-3">
                    <BookOpen className="size-4 text-slate-400 group-hover:text-amber-500 shrink-0 transition-colors" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate group-hover:text-amber-600 dark:group-hover:text-amber-400">
                        {item.title}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 truncate">
                        /{item.slug}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.starredAt && (
                      <span className="text-[10px] text-slate-400 hidden sm:inline">
                        {new Date(item.starredAt).toLocaleDateString('ja-JP')}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleRemove(item.slug, e)}
                      title="お気に入りから削除"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                    <ArrowRight className="size-3.5 text-slate-300 group-hover:text-amber-500 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between shrink-0 text-xs">
          {items.length > 0 ? (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
            >
              すべて解除
            </button>
          ) : (
            <div />
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
