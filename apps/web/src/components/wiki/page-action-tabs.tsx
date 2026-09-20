'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSitePageHref } from '@/lib/site-url';
import {
  BookOpen,
  Edit3,
  Code2,
  History,
  Star,
  ChevronDown,
  Printer,
  Link as LinkIcon,
  Info,
  Download,
  MessageSquare,
  Check,
  Link2,
  Share2,
  Move,
  Trash2,
  BookmarkCheck,
} from 'lucide-react';
import { PageHistoryModal } from './page-history-modal';
import { PageSourceModal } from './page-source-modal';
import { PageInfoModal } from './page-info-modal';
import {
  WatchlistModal,
  addToWatchlist,
  removeFromWatchlist,
  isPageInWatchlist,
  getWatchlist,
} from './watchlist-modal';
import { BacklinksModal } from './backlinks-modal';
import { ShareModal } from './share-modal';
import { PageMoveModal } from './page-move-modal';
import { pagesApi } from '@/lib/api';

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
  allPages?: Array<{
    id: string;
    slug: string;
    title: string;
    content?: string;
  }>;
  onOpenComments?: () => void;
  commentsCount?: number;
  canEdit?: boolean;
}

export function PageActionTabs({
  page,
  site,
  allPages = [],
  onOpenComments,
  commentsCount = 0,
  canEdit = false,
}: PageActionTabsProps) {
  const router = useRouter();

  // モーダル開閉ステート
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [backlinksOpen, setBacklinksOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  // スター & メニューステート
  const [isStarred, setIsStarred] = useState(false);
  const [watchlistCount, setWatchlistCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const brandColor = site.primary_color || '#3b82f6';

  // トースト表示タイマー
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 2800);
  };

  // お気に入り（スター）の状態同期
  useEffect(() => {
    if (typeof window !== 'undefined' && site.slug) {
      setIsStarred(isPageInWatchlist(site.slug, page.slug));
      setWatchlistCount(getWatchlist(site.slug).length);
    }
  }, [site.slug, page.slug]);

  const toggleStar = () => {
    if (isStarred) {
      removeFromWatchlist(site.slug, page.slug);
      setIsStarred(false);
      setWatchlistCount((c) => Math.max(0, c - 1));
      showToast('お気に入り（ウォッチリスト）から解除しました');
    } else {
      addToWatchlist(site.slug, {
        id: page.id,
        slug: page.slug,
        title: page.title,
      });
      setIsStarred(true);
      setWatchlistCount((c) => c + 1);
      showToast(`★「${page.title}」をお気に入りに追加しました`);
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
      setDropdownOpen(false);
      showToast('固定リンクをクリップボードにコピーしました');
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
      showToast('Markdownファイルをダウンロードしました');
    }
  };

  // ページ削除 (関係者・編集者)
  const handleDeletePage = async () => {
    setDropdownOpen(false);
    if (
      !confirm(
        `ページ「${page.title}」をゴミ箱に移動しますか？\n（ゴミ箱からいつでも復元できます）`
      )
    ) {
      return;
    }

    try {
      await pagesApi.delete(page.id);
      showToast('ページをゴミ箱に移動しました');
      router.push(getSitePageHref(site.slug, ''));
    } catch (err: any) {
      alert('削除に失敗しました: ' + (err?.response?.data?.error || err?.message || '不明なエラー'));
    }
  };

  return (
    <>
      {/* 操作フィードバック用トースト */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 dark:bg-slate-100/90 text-white dark:text-slate-900 backdrop-blur-md px-4 py-2 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-medium border border-slate-700/40 dark:border-slate-300/40 animate-in fade-in-0 slide-in-from-top-2 duration-150">
          <BookmarkCheck className="size-4 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

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

        {/* 右側: ツール (★お気に入り, その他▼) */}
        <div className="flex items-center gap-1 shrink-0 pb-1">
          {/* ★ お気に入りボタン */}
          <button
            type="button"
            onClick={toggleStar}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              isStarred
                ? 'border-amber-300 bg-amber-50 text-amber-500 dark:bg-amber-950/50 dark:border-amber-700 shadow-2xs scale-105'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title={
              isStarred
                ? 'お気に入りから解除 (ウォッチリストから除外)'
                : 'このページをお気に入りに追加 (ウォッチリストに登録)'
            }
            aria-label="お気に入り"
          >
            <Star
              className={`size-4 transition-transform ${
                isStarred ? 'fill-amber-400 text-amber-400 scale-110' : ''
              }`}
            />
          </button>

          {/* その他 ▼ ドロップダウン */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <span>その他</span>
              <ChevronDown
                className={`size-3 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl py-1.5 z-30 animate-in fade-in-0 zoom-in-95 duration-100 text-xs divide-y divide-slate-100 dark:divide-slate-800">
                {/* グループ 1: ウォッチリスト & リンク元 & 共有 */}
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      setWatchlistOpen(true);
                    }}
                    className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Star className="size-3.5 text-amber-500 fill-amber-400" />
                      <span>お気に入り一覧</span>
                    </div>
                    {watchlistCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-bold text-[10px]">
                        {watchlistCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      setBacklinksOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-left cursor-pointer"
                    title="このページへリンクしているページ一覧"
                  >
                    <Link2 className="size-3.5 text-blue-500" />
                    <span>リンク元 (What links here)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      setShareOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-left cursor-pointer"
                  >
                    <Share2 className="size-3.5 text-indigo-500" />
                    <span>共有 & QRコード</span>
                  </button>
                </div>

                {/* グループ 2: ユーティリティ */}
                <div className="py-1">
                  <button
                    type="button"
                    onClick={handleCopyPermalink}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-left cursor-pointer"
                  >
                    <LinkIcon className="size-3.5 text-slate-400" />
                    <span>固定リンクをコピー</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      setInfoOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-left cursor-pointer"
                  >
                    <Info className="size-3.5 text-slate-400" />
                    <span>ページ情報</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrint}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-left cursor-pointer"
                  >
                    <Printer className="size-3.5 text-slate-400" />
                    <span>印刷用バージョン</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadMarkdown}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-left cursor-pointer"
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
                      className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-left cursor-pointer"
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

                {/* グループ 3: 管理者・編集者アクション */}
                {canEdit && (
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        setMoveOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-left cursor-pointer"
                      title="ページタイトルやスラグ（URL）を変更"
                    >
                      <Move className="size-3.5 text-slate-400" />
                      <span>ページの移動 (改名)</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDeletePage}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 transition-colors text-left cursor-pointer"
                    >
                      <Trash2 className="size-3.5 text-rose-500" />
                      <span>ページを削除 (ゴミ箱へ)</span>
                    </button>
                  </div>
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

      <WatchlistModal
        isOpen={watchlistOpen}
        onClose={() => setWatchlistOpen(false)}
        siteSlug={site.slug}
        onWatchlistChange={() => {
          setIsStarred(isPageInWatchlist(site.slug, page.slug));
          setWatchlistCount(getWatchlist(site.slug).length);
        }}
      />

      <BacklinksModal
        isOpen={backlinksOpen}
        onClose={() => setBacklinksOpen(false)}
        siteSlug={site.slug}
        currentPage={{ slug: page.slug, title: page.title }}
        allPages={allPages}
      />

      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        pageTitle={page.title}
        siteTitle={site.title}
      />

      {canEdit && (
        <PageMoveModal
          isOpen={moveOpen}
          onClose={() => setMoveOpen(false)}
          page={{ id: page.id, slug: page.slug, title: page.title }}
          siteSlug={site.slug}
        />
      )}
    </>
  );
}
