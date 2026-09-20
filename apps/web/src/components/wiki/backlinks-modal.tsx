'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Link2, X, Search, ArrowRight, FileText, ExternalLink } from 'lucide-react';
import { getSitePageHref } from '@/lib/site-url';

interface BacklinkPage {
  id: string;
  slug: string;
  title: string;
  content?: string;
}

interface BacklinksModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteSlug: string;
  currentPage: {
    slug: string;
    title: string;
  };
  allPages: BacklinkPage[];
  onSelectPage?: () => void;
}

export function BacklinksModal({
  isOpen,
  onClose,
  siteSlug,
  currentPage,
  allPages,
  onSelectPage,
}: BacklinksModalProps) {
  const [search, setSearch] = useState('');

  // リンク元の検出
  const referringPages = useMemo(() => {
    if (!isOpen || !currentPage.slug) return [];

    const targetSlug = currentPage.slug.toLowerCase().trim().replace(/^\//, '');
    const targetTitle = currentPage.title.toLowerCase().trim();

    return allPages.filter((p) => {
      const pSlug = (p.slug || '').toLowerCase().trim().replace(/^\//, '');
      if (pSlug === targetSlug) return false; // 自分自身は除外

      const content = (p.content || '').toLowerCase();
      if (!content) return false;

      // 1. [[targetSlug]] or [[targetSlug|...]]
      const hasWikiSlugLink =
        content.includes(`[[${targetSlug}]]`) ||
        content.includes(`[[${targetSlug}|`) ||
        content.includes(`[[/${targetSlug}]]`) ||
        content.includes(`[[/${targetSlug}|`);

      // 2. [[targetTitle]] or [[targetTitle|...]]
      const hasWikiTitleLink =
        targetTitle &&
        (content.includes(`[[${targetTitle}]]`) || content.includes(`[[${targetTitle}|`));

      // 3. 通常リンク [label](/sites/siteSlug/targetSlug) or [label](/targetSlug)
      const hasMarkdownLink =
        content.includes(`/${targetSlug})`) ||
        content.includes(`/${targetSlug}#`) ||
        content.includes(`/${targetSlug}"`);

      return hasWikiSlugLink || hasWikiTitleLink || hasMarkdownLink;
    });
  }, [isOpen, currentPage.slug, currentPage.title, allPages]);

  if (!isOpen) return null;

  const filtered = referringPages.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in-0 zoom-in-95 duration-150">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60">
              <Link2 className="size-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                リンク元 (What links here)
              </h3>
              <p className="text-xs text-slate-400 truncate max-w-xs">
                「{currentPage.title}」へリンクしているページ ({referringPages.length} 件)
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
        {referringPages.length > 3 && (
          <div className="px-6 pt-4 pb-2 shrink-0">
            <div className="relative">
              <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="リンク元ページを絞り込み..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* リスト */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {referringPages.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl">
              <Link2 className="size-10 stroke-[1.2] mx-auto text-slate-300 dark:text-slate-700" />
              <p className="font-semibold text-sm text-slate-600 dark:text-slate-400">
                このページへのリンク元はありません
              </p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                他のページから <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px]">[[{currentPage.slug}]]</code> と記述することで内部リンクを作成できます。
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
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-850 hover:bg-blue-50/60 dark:hover:bg-blue-950/20 hover:border-blue-200 dark:hover:border-blue-800/60 transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-3">
                    <FileText className="size-4 text-slate-400 group-hover:text-blue-500 shrink-0 transition-colors" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                        {item.title}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 truncate">
                        /{item.slug}
                      </div>
                    </div>
                  </div>

                  <ArrowRight className="size-3.5 text-slate-300 group-hover:text-blue-500 transition-transform group-hover:translate-x-0.5 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-end shrink-0 text-xs">
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
