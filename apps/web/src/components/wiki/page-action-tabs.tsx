'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Edit3,
  Code2,
  History,
  Star,
  MoreHorizontal,
  ChevronDown,
  Printer,
  Link as LinkIcon,
  Info,
  Download,
  MessageSquare,
  Check,
} from 'lucide-react';
import { PageHistoryModal } from './page-history-modal';
import { PageSourceModal } from './page-source-modal';
import { PageInfoModal } from './page-info-modal';

interface PageActionTabsProps {
  page: {
    id: string;
    slug: string;
    title: string;
    content: string;
    created_at?: string;
    updated_at?: string;
  };
  site: {
    id: string;
    slug: string;
    title: string;
    primary_color?: string;
  };
  onOpenComments?: () => void;
  commentsCount?: number;
  canEdit?: boolean;
}

export function PageActionTabs({
  page,
  site,
  onOpenComments,
  commentsCount = 0,
  canEdit = false,
}: PageActionTabsProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [isStarred, setIsStarred] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const brandColor = site.primary_color || '#3b82f6';

  // お気に入り（スター）の状態管理（LocalStorage）
  useEffect(() => {
    if (typeof window !== 'undefined' && page.id) {
      const starKey = `klados_star_${site.slug}_${page.slug || 'index'}`;
      setIsStarred(localStorage.getItem(starKey) === 'true');
    }
  }, [site.slug, page.slug, page.id]);

  const toggleStar = () => {
    const next = !isStarred;
    setIsStarred(next);
    if (typeof window !== 'undefined') {
      const starKey = `klados_star_${site.slug}_${page.slug || 'index'}`;
      if (next) {
        localStorage.setItem(starKey, 'true');
      } else {
        localStorage.removeItem(starKey);
      }
    }
  };

  // ドロップダウンの外側クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 印刷
  const handlePrint = () => {
    setDropdownOpen(false);
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  // 固定リンクをコピー
  const handleCopyPermalink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => {
        setLinkCopied(false);
        setDropdownOpen(false);
      }, 1800);
    }
  };

  // Markdownダウンロード
  const handleDownloadMarkdown = () => {
    setDropdownOpen(false);
    if (typeof window !== 'undefined') {
      const blob = new Blob([page.content || ''], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${page.slug || 'index'}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-px mb-6 overflow-x-auto select-none">
        {/* 左側: メインタブ (閲覧・編集・ソース・履歴) */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* 閲覧タブ (アクティブ) */}
          <span
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-t-xl border-t border-x border-b-0 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs -mb-px relative z-10"
            style={{ color: brandColor }}
          >
            <BookOpen className="size-3.5" />
            <span>閲覧</span>
          </span>

          {/* 編集タブ (関係者・編集権限がある場合のみ表示) */}
          {canEdit && (
            <Link
              href={`/dashboard/pages/${page.id}/edit`}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded-t-xl transition-colors cursor-pointer"
              title="エディタを開いてこのページを編集"
            >
              <Edit3 className="size-3.5" />
              <span>編集</span>
            </Link>
          )}

          {/* ソースを表示タブ */}
          <button
            type="button"
            onClick={() => setSourceOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded-t-xl transition-colors cursor-pointer"
            title="Markdownソースコードを表示"
          >
            <Code2 className="size-3.5" />
            <span className="hidden sm:inline">ソースを表示</span>
            <span className="sm:hidden">ソース</span>
          </button>

          {/* 履歴表示タブ */}
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded-t-xl transition-colors cursor-pointer"
            title="版の履歴と差分を表示"
          >
            <History className="size-3.5" />
            <span className="hidden sm:inline">履歴表示</span>
            <span className="sm:hidden">履歴</span>
          </button>
        </div>

        {/* 右側: ツール (★お気に入り, コメント, その他▼) */}
        <div className="flex items-center gap-1 shrink-0 pb-1">
          {/* ★ お気に入りボタン */}
          <button
            type="button"
            onClick={toggleStar}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isStarred
                ? 'border-amber-300 bg-amber-50 text-amber-500 dark:bg-amber-950/40 dark:border-amber-700'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title={isStarred ? 'お気に入りから解除' : 'このページをお気に入りに追加'}
            aria-label="お気に入り"
          >
            <Star className={`size-4 ${isStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>

          {/* その他 ▼ ドロップダウン */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <span>その他</span>
              <ChevronDown className={`size-3 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl py-1 z-30 animate-in fade-in-0 zoom-in-95 duration-100 text-xs">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-left cursor-pointer"
                >
                  <Printer className="size-3.5 text-slate-400" />
                  <span>印刷用バージョン</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyPermalink}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-left cursor-pointer"
                >
                  {linkCopied ? (
                    <>
                      <Check className="size-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">リンクをコピー済</span>
                    </>
                  ) : (
                    <>
                      <LinkIcon className="size-3.5 text-slate-400" />
                      <span>固定リンクをコピー</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    setInfoOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-left cursor-pointer"
                >
                  <Info className="size-3.5 text-slate-400" />
                  <span>ページ情報</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadMarkdown}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-left cursor-pointer border-t border-slate-100 dark:border-slate-800 mt-1 pt-1.5"
                >
                  <Download className="size-3.5 text-slate-400" />
                  <span>Markdownをダウンロード</span>
                </button>

                {onOpenComments && (
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      onOpenComments();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <MessageSquare className="size-3.5 text-slate-400" />
                      <span>コメントを見る</span>
                    </div>
                    {commentsCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-bold text-[10px]">
                        {commentsCount}
                      </span>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* モーダル群 */}
      <PageHistoryModal
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        page={page}
        canEdit={canEdit}
      />

      <PageSourceModal
        isOpen={sourceOpen}
        onClose={() => setSourceOpen(false)}
        page={page}
        canEdit={canEdit}
      />

      <PageInfoModal
        isOpen={infoOpen}
        onClose={() => setInfoOpen(false)}
        page={page}
        site={site}
      />
    </>
  );
}
