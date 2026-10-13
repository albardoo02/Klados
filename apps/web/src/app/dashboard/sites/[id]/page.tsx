'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pagesApi, sitesApi, categoriesApi, downloadSiteZip, CategorySummary } from '@/lib/api';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { MediaLibraryModal } from '@/components/media-library-modal';
import {
  ExternalLink,
  Plus,
  ArrowLeft,
  FileText,
  BarChart3,
  Settings,
  Images,
  Download,
  Trash2,
  RotateCcw,
  Check,
  Loader2,
  Users,
  Settings2,
  UploadCloud,
  FolderTree,
  Edit2,
  X,
} from 'lucide-react';
import { SidebarEditorModal } from '@/components/wiki/sidebar-editor-modal';
import { ImportMarkdownModal } from '@/components/import-markdown-modal';
import { useTranslations } from 'next-intl';
import { getSitePublicUrl } from '@/lib/site-url';
import { getPageCategoryNames } from '@/components/markdown-renderer';

interface Page {
  id: string;
  slug: string;
  title: string;
  content?: string;
  categories?: string[];
  frontmatter?: { categories?: string[]; [key: string]: any };
  status: string;
  updated_at: string;
  deleted_at?: string | null;
}

export default function SiteDetailPage() {
  const tNav = useTranslations('site_nav');
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'pages' | 'trash'>('pages');
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [sidebarEditorOpen, setSidebarEditorOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // ページ個別設定モーダル用ステート (タイトル・スラッグ・カテゴリ変更)
  const [editingPage, setEditingPage] = useState<Page | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editCategories, setEditCategories] = useState<string[]>([]);
  const [editCategoryInput, setEditCategoryInput] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const { data: site } = useQuery({
    queryKey: ['site', id],
    queryFn: () => sitesApi.get(id).then((r) => r.data.data),
  });

  const { data: pages, isLoading: isPagesLoading } = useQuery<Page[]>({
    queryKey: ['pages', id],
    queryFn: () => pagesApi.list(id).then((r) => r.data.data as Page[]),
  });

  const { data: siteCategories = [] } = useQuery<CategorySummary[]>({
    queryKey: ['site-categories', id],
    queryFn: () =>
      categoriesApi
        .listForSite(id)
        .then((r) => (r.data?.data as CategorySummary[]) || [])
        .catch(() => []),
  });

  // ゴミ箱のページ取得
  const { data: trashPages = [], isLoading: isTrashLoading } = useQuery<Page[]>({
    queryKey: ['trash-pages', id],
    queryFn: async () => {
      try {
        const res = await pagesApi.trash(id);
        if (res.data?.data) return res.data.data;
      } catch {
        // Fallback to local filtering
      }
      return [];
    },
  });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ slug: '', title: '', category: '' });

  // ページ新規作成 (カテゴリはFrontmatter/オプションとして安全に保存)
  const createMutation = useMutation({
    mutationFn: () => {
      const cats = form.category
        ? form.category
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean)
        : [];
      return pagesApi.create(id, {
        slug: form.slug,
        title: form.title,
        categories: cats.length > 0 ? cats : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages', id] });
      queryClient.invalidateQueries({ queryKey: ['site-categories', id] });
      setShowCreate(false);
      setForm({ slug: '', title: '', category: '' });
      showToast('ページを作成しました');
    },
  });

  // ページ設定変更 (タイトル・スラッグ・カテゴリ)
  const updatePageSettingsMutation = useMutation({
    mutationFn: async () => {
      if (!editingPage) return;
      const cleanSlug = editSlug
        .trim()
        .replace(/^\/+|\/+$/g, '')
        .replace(/\s+/g, '-');
      return pagesApi.update(editingPage.id, {
        title: editTitle.trim(),
        slug: cleanSlug,
        categories: editCategories,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages', id] });
      queryClient.invalidateQueries({ queryKey: ['site-categories', id] });
      setEditingPage(null);
      showToast('ページ設定（タイトル・スラッグ・カテゴリ）を更新しました');
    },
    onError: (err: any) => {
      setEditError(err?.response?.data?.error || err?.message || '設定の保存に失敗しました');
    },
  });

  const openPageSettingsModal = (page: Page) => {
    setEditingPage(page);
    setEditTitle(page.title);
    setEditSlug(page.slug);
    setEditCategories(getPageCategoryNames(page));
    setEditCategoryInput('');
    setEditError(null);
  };

  const handleAddEditCategory = (name?: string) => {
    const target = (name ?? editCategoryInput).trim().replace(/^(?:category|カテゴリ)\s*:\s*/i, '');
    if (!target) return;
    if (!editCategories.some((c) => c.toLowerCase() === target.toLowerCase())) {
      setEditCategories((prev) => [...prev, target]);
    }
    if (name === undefined) {
      setEditCategoryInput('');
    }
  };

  const handleRemoveEditCategory = (name: string) => {
    setEditCategories((prev) => prev.filter((c) => c !== name));
  };

  // ページをゴミ箱へ移動 (ソフトデリート)
  const deleteMutation = useMutation({
    mutationFn: (pageId: string) => pagesApi.delete(pageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages', id] });
      queryClient.invalidateQueries({ queryKey: ['trash-pages', id] });
      showToast('ページをゴミ箱に移動しました');
    },
  });

  // ゴミ箱からページを復元
  const restoreMutation = useMutation({
    mutationFn: (pageId: string) => pagesApi.restore(pageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages', id] });
      queryClient.invalidateQueries({ queryKey: ['trash-pages', id] });
      showToast('ページを復元しました');
    },
  });

  // ZIPエクスポート処理
  const handleExportZip = async () => {
    if (!site) return;
    setIsExporting(true);
    try {
      await downloadSiteZip(site, pages || []);
      showToast('サイトのZIPエクスポートが完了しました');
    } catch (err: any) {
      alert('エクスポートに失敗しました: ' + (err?.message || '不明なエラー'));
    } finally {
      setIsExporting(false);
    }
  };

  const activePages = (pages || []).filter((p) => p.status !== 'trashed');
  // トラッシュリスト: APIレスポンスまたはローカルでtrashedのページ
  const trashedItems = [
    ...trashPages,
    ...(pages || []).filter((p) => p.status === 'trashed' && !trashPages.some((t) => t.id === p.id)),
  ];

  return (
    <div className="max-w-5xl mx-auto pb-20">
      {/* 成功トースト */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in-0 slide-in-from-top-2">
          <Check className="size-4 text-emerald-400 dark:text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* サイト上部ヘッダー */}
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors mb-3"
        >
          <ArrowLeft className="size-3.5" />
          <span>ダッシュボードに戻る</span>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{site?.title ?? '...'}</h1>
              {site?.is_public ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">
                  公開中
                </span>
              ) : (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                  非公開
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
              <span className="font-mono">{site?.slug}.klados.app</span>
              {site?.custom_domain && (
                <>
                  <span>•</span>
                  <span className="font-mono text-blue-600">{site.custom_domain}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* ZIPエクスポートボタン */}
            <button
              type="button"
              onClick={handleExportZip}
              disabled={isExporting || !site}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
              title="サイトの全MarkdownページとマニフェストをZIP形式でダウンロード"
            >
              {isExporting ? (
                <Loader2 className="size-3.5 animate-spin text-blue-600" />
              ) : (
                <Download className="size-3.5 text-blue-600" />
              )}
              <span>{isExporting ? 'エクスポート中...' : 'Export (ZIP)'}</span>
            </button>

            {/* Markdown / ZIP インポートボタン */}
            <button
              type="button"
              onClick={() => setImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-xl border border-blue-200 transition-colors shadow-2xs cursor-pointer"
              title=".md ファイルや ZIP をアップロードして一括公開"
            >
              <UploadCloud className="size-3.5 text-blue-600" />
              <span>Import Markdown</span>
            </button>

            <button
              type="button"
              onClick={() => setMediaLibraryOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors shadow-2xs cursor-pointer"
            >
              <Images className="size-3.5 text-blue-600" />
              <span>メディア管理</span>
            </button>

            <button
              type="button"
              onClick={() => setSidebarEditorOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors shadow-2xs cursor-pointer"
              title="サイドバーの見出しやリンク構成を編集 (MediaWiki:Sidebar)"
            >
              <Settings2 className="size-3.5 text-indigo-600" />
              <span>サイドバー編集</span>
            </button>

            {site?.slug && (
              <a
                href={getSitePublicUrl(site)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors shadow-2xs"
              >
                <span>{tNav('view_site')}</span>
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* タブナビゲーション */}
        <div className="flex items-center gap-2 mt-6 border-b border-slate-200 text-sm">
          <button
            type="button"
            onClick={() => setActiveTab('pages')}
            className={`flex items-center gap-2 px-4 py-2.5 font-semibold transition-colors cursor-pointer border-b-2 ${
              activeTab === 'pages'
                ? 'text-blue-600 border-blue-600'
                : 'text-slate-600 hover:text-slate-900 border-transparent'
            }`}
          >
            <FileText className="size-4" />
            <span>{tNav('pages')} ({activePages.length})</span>
          </button>

          {/* ゴミ箱 (Trash) タブ */}
          <button
            type="button"
            onClick={() => setActiveTab('trash')}
            className={`flex items-center gap-2 px-4 py-2.5 font-semibold transition-colors cursor-pointer border-b-2 ${
              activeTab === 'trash'
                ? 'text-blue-600 border-blue-600'
                : 'text-slate-600 hover:text-slate-900 border-transparent'
            }`}
          >
            <Trash2 className="size-4" />
            <span>{tNav('trash')}</span>
            {trashedItems.length > 0 && (
              <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-700 font-bold">
                {trashedItems.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMediaLibraryOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:text-slate-900 transition-colors border-b-2 border-transparent cursor-pointer"
          >
            <Images className="size-4" />
            <span>{tNav('media')}</span>
          </button>
          <Link
            href={`/dashboard/sites/${id}/analytics`}
            className="flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:text-slate-900 transition-colors border-b-2 border-transparent"
          >
            <BarChart3 className="size-4" />
            <span>{tNav('analytics')}</span>
          </Link>
          <Link
            href={`/dashboard/sites/${id}/members`}
            className="flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:text-slate-900 transition-colors border-b-2 border-transparent"
          >
            <Users className="size-4" />
            <span>{tNav('members')}</span>
          </Link>
          <Link
            href={`/dashboard/sites/${id}/settings`}
            className="flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:text-slate-900 transition-colors border-b-2 border-transparent"
          >
            <Settings className="size-4" />
            <span>{tNav('settings')}</span>
          </Link>
        </div>
      </div>

      {/* タブコンテンツ 1: ページ一覧 */}
      {activeTab === 'pages' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold">ページ一覧</h2>
              <p className="text-xs text-slate-500">
                サイト内で公開するドキュメントや記事を管理します
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setImportModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition-colors shadow-2xs cursor-pointer"
                title=".md や .zip をアップロードしてページを追加"
              >
                <UploadCloud className="size-3.5 text-blue-600" />
                <span>Markdownをインポート</span>
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>新規ページ作成</span>
              </button>
            </div>
          </div>

          {showCreate && (
            <div className="bg-white rounded-2xl border p-5 mb-5 shadow-xs animate-in fade-in-0 slide-in-from-top-2">
              <h3 className="font-bold text-sm mb-3">新しいページを作成</h3>
              <div className="space-y-3">
                <input
                  placeholder="ページタイトル (例: スタートガイド)"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex items-center">
                  <span className="px-3 py-2 bg-slate-100 text-slate-500 text-xs font-mono border border-r-0 rounded-l-xl select-none">
                    /
                  </span>
                  <input
                    placeholder="スラッグ (例: guide, about, index)"
                    value={form.slug}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                      })
                    }
                    className="w-full border rounded-r-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <input
                  placeholder="カテゴリ (任意・カンマ区切り、例: ドキュメント, ガイド)"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => createMutation.mutate()}
                    disabled={createMutation.isPending || !form.title || !form.slug}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    作成して編集を開始
                  </button>
                  <button
                    onClick={() => setShowCreate(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          )}

          {isPagesLoading ? (
            <div className="py-20 text-center text-slate-400 text-sm">読み込み中...</div>
          ) : (
            <div className="space-y-2.5">
              {activePages.map((page) => {
                const pageCats = getPageCategoryNames(page);
                return (
                  <div
                    key={page.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-2xl border px-5 py-4 hover:shadow-sm transition-all group"
                  >
                    <Link
                      href={`/dashboard/pages/${page.id}/edit`}
                      className="flex-1 min-w-0"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {page.title}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">/{page.slug}</span>
                        {pageCats.map((cat) => (
                          <span
                            key={cat}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200/80"
                          >
                            <FolderTree className="size-2.5 text-amber-500" />
                            {cat}
                          </span>
                        ))}
                      </div>
                      {page.updated_at && (
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          最終更新: {new Date(page.updated_at).toLocaleDateString('ja-JP')}
                        </span>
                      )}
                    </Link>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* ページ設定変更ボタン (タイトル・スラッグ・カテゴリ) */}
                      <button
                        type="button"
                        onClick={() => openPageSettingsModal(page)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition-colors cursor-pointer"
                        title="タイトル・スラッグ・カテゴリ割り当てを変更"
                      >
                        <Edit2 className="size-3.5" />
                        <span>設定変更</span>
                      </button>

                      {page.status === 'published' && site?.slug && (
                        <Link
                          href={`/sites/${site.slug}/${page.slug === 'index' ? '' : page.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          title="公開ページを表示"
                        >
                          <ExternalLink className="size-4" />
                        </Link>
                      )}
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          page.status === 'published'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {page.status === 'published' ? '公開中' : '下書き'}
                      </span>

                      {/* ゴミ箱へ移動ボタン */}
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`ページ「${page.title}」をゴミ箱に移動しますか？`)) {
                            deleteMutation.mutate(page.id);
                          }
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="ゴミ箱へ移動"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {activePages.length === 0 && (
                <div className="text-center py-16 text-slate-400 text-sm border-2 border-dashed rounded-2xl">
                  ページがまだありません。「新規ページ作成」から最初のページを作成してください
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* タブコンテンツ 2: ゴミ箱 (Trash Management) */}
      {activeTab === 'trash' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Trash2 className="size-5 text-rose-500" />
                <span>ゴミ箱 (Trash)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                削除されたページが一時保管されます。必要な場合はいつでも復元できます。
              </p>
            </div>
          </div>

          {isTrashLoading ? (
            <div className="py-20 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin text-blue-600" />
              <span>ゴミ箱を読み込み中...</span>
            </div>
          ) : trashedItems.length === 0 ? (
            <div className="text-center py-20 text-slate-400 border-2 border-dashed rounded-2xl">
              <Trash2 className="size-10 mx-auto stroke-[1.2] text-slate-300 mb-2" />
              <p className="font-semibold text-sm">ゴミ箱は空です</p>
              <p className="text-xs mt-1 text-slate-400">削除されたページはありません</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {trashedItems.map((page) => (
                <div
                  key={page.id}
                  className="flex items-center justify-between bg-white rounded-2xl border border-rose-100 p-4 shadow-2xs hover:shadow-sm transition-all"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 text-sm">{page.title}</span>
                      <span className="text-xs text-slate-400 font-mono">/{page.slug}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 font-semibold border border-rose-200">
                        削除済み
                      </span>
                    </div>
                    {page.deleted_at && (
                      <span className="text-[11px] text-slate-400 block mt-1">
                        削除日時: {new Date(page.deleted_at).toLocaleString('ja-JP')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* 復元ボタン */}
                    <button
                      type="button"
                      onClick={() => restoreMutation.mutate(page.id)}
                      disabled={restoreMutation.isPending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold border border-emerald-200 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                      title="このページを元のページ一覧に復元"
                    >
                      <RotateCcw className="size-3.5" />
                      <span>復元 (Restore)</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ページ設定変更モーダル (スラッグ・タイトル・カテゴリ割り当て) */}
      {editingPage && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-0 duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200/60">
                  <Edit2 className="size-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">ページ設定の変更</h3>
                  <p className="text-xs text-slate-400">
                    ページタイトル・スラッグ・カテゴリ割り当てを変更します
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingPage(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editTitle.trim() || !editSlug.trim()) return;
                updatePageSettingsMutation.mutate();
              }}
              className="p-6 space-y-4"
            >
              {editError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs">
                  {editError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">ページタイトル</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="例: スタートガイド"
                  className="w-full text-sm px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">スラッグ (URLパス)</label>
                <div className="flex items-center">
                  <span className="px-3 py-2 bg-slate-100 border border-r-0 border-slate-200 rounded-l-xl text-xs font-mono text-slate-500 select-none">
                    /
                  </span>
                  <input
                    type="text"
                    required
                    value={editSlug}
                    onChange={(e) => setEditSlug(e.target.value)}
                    placeholder="例: guide, index"
                    className="w-full text-sm font-mono px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-r-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* カテゴリ割り当て */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <FolderTree className="size-3.5 text-amber-500" />
                  <span>カテゴリの割り当て</span>
                </label>
                <p className="text-[11px] text-slate-400">
                  本文内に <code className="font-mono">[[Category:...]]</code> を書かなくても安全にカテゴリを保持できます。
                </p>

                {editCategories.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {editCategories.map((cat) => (
                      <span
                        key={cat}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200"
                      >
                        <FolderTree className="size-3 text-amber-500" />
                        {cat}
                        <button
                          type="button"
                          onClick={() => handleRemoveEditCategory(cat)}
                          className="ml-0.5 hover:text-rose-600 cursor-pointer"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">カテゴリ未設定</p>
                )}

                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={editCategoryInput}
                    onChange={(e) => setEditCategoryInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddEditCategory();
                      }
                    }}
                    placeholder="新しいカテゴリ名を入力..."
                    className="flex-1 text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddEditCategory()}
                    disabled={!editCategoryInput.trim()}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                    追加
                  </button>
                </div>

                {siteCategories.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 pt-1">
                    <span className="text-[10px] text-slate-400 mr-1">サイト内の既存カテゴリ:</span>
                    {siteCategories.slice(0, 15).map((c) => {
                      const isSelected = editCategories.some(
                        (item) => item.toLowerCase() === c.name.toLowerCase()
                      );
                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() =>
                            isSelected
                              ? handleRemoveEditCategory(c.name)
                              : handleAddEditCategory(c.name)
                          }
                          className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-amber-400'
                          }`}
                        >
                          {isSelected ? '✓ ' : '+ '}
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingPage(null)}
                  disabled={updatePageSettingsMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={
                    updatePageSettingsMutation.isPending ||
                    !editTitle.trim() ||
                    !editSlug.trim()
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {updatePageSettingsMutation.isPending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>保存中...</span>
                    </>
                  ) : (
                    <>
                      <Check className="size-3.5" />
                      <span>変更を保存</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* メディアライブラリモーダル */}
      <MediaLibraryModal
        isOpen={mediaLibraryOpen}
        onClose={() => setMediaLibraryOpen(false)}
        siteId={id}
      />

      {/* サイドバー編集モーダル (MediaWiki:Sidebar) */}
      <SidebarEditorModal
        isOpen={sidebarEditorOpen}
        onClose={() => setSidebarEditorOpen(false)}
        siteId={id}
        siteSlug={site?.slug || ''}
        currentSections={site?.settings?.sidebar_sections}
        showToolsSection={site?.settings?.sidebar_show_tools ?? true}
        availablePages={pages || []}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['site', id] });
          showToast('サイドバー構成を保存しました');
        }}
      />

      {/* Markdown / ZIP インポートモーダル */}
      <ImportMarkdownModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        siteId={id}
        existingPages={pages || []}
        onSuccess={(count) => {
          queryClient.invalidateQueries({ queryKey: ['pages', id] });
          showToast(`${count} 件のページをインポートしました`);
        }}
      />
    </div>
  );
}
