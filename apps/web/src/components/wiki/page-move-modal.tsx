'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Edit2, X, Loader2, ArrowRight, FolderTree, Plus } from 'lucide-react';
import { pagesApi, categoriesApi, CategorySummary } from '@/lib/api';
import { getSitePageHref } from '@/lib/site-url';
import { getPageCategoryNames } from '@/components/markdown-renderer';

interface PageMoveModalProps {
  isOpen: boolean;
  onClose: () => void;
  page: {
    id: string;
    slug: string;
    title: string;
    content?: string;
    categories?: string[];
    frontmatter?: { categories?: string[]; [key: string]: any };
  };
  siteSlug: string;
  siteId?: string;
}

export function PageMoveModal({ isOpen, onClose, page, siteSlug, siteId }: PageMoveModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug || '');
  const [categories, setCategories] = useState<string[]>(() => getPageCategoryNames(page));
  const [categoryInput, setCategoryInput] = useState('');
  const [existingCategories, setExistingCategories] = useState<CategorySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(page.title);
      setSlug(page.slug || '');
      setCategories(getPageCategoryNames(page));
      setCategoryInput('');
      setError(null);

      if (siteId && siteId !== 'demo-site') {
        categoriesApi
          .listForSite(siteId)
          .then((res) => setExistingCategories(res.data?.data || []))
          .catch(() => {});
      } else if (siteSlug) {
        categoriesApi
          .listPublic(siteSlug)
          .then((res) => setExistingCategories(res.data?.data || []))
          .catch(() => {});
      }
    }
  }, [isOpen, page, siteId, siteSlug]);

  if (!isOpen) return null;

  const handleAddCategory = (name?: string) => {
    const target = (name ?? categoryInput).trim().replace(/^(?:category|カテゴリ)\s*:\s*/i, '');
    if (!target) return;
    if (!categories.some((c) => c.toLowerCase() === target.toLowerCase())) {
      setCategories((prev) => [...prev, target]);
    }
    if (name === undefined) {
      setCategoryInput('');
    }
  };

  const handleRemoveCategory = (name: string) => {
    setCategories((prev) => prev.filter((c) => c !== name));
  };

  const handleMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const cleanSlug = slug
        .trim()
        .replace(/^\/+|\/+$/g, '')
        .replace(/\s+/g, '-');

      await pagesApi.update(page.id, {
        title: title.trim(),
        slug: cleanSlug,
        categories,
      });

      queryClient.invalidateQueries({ queryKey: ['public-site', siteSlug] });
      queryClient.invalidateQueries({ queryKey: ['public-page', siteSlug] });
      queryClient.invalidateQueries({ queryKey: ['public-categories', siteSlug] });
      if (siteId) {
        queryClient.invalidateQueries({ queryKey: ['pages', siteId] });
      }

      onClose();
      if (cleanSlug !== page.slug) {
        router.push(getSitePageHref(siteSlug, cleanSlug));
      } else {
        router.refresh();
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'ページ設定の更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60">
              <Edit2 className="size-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">ページ設定・移動 (改名・カテゴリ)</h3>
              <p className="text-xs text-slate-400">タイトル・スラッグ（URL）・カテゴリを設定します</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* フォーム */}
        <form onSubmit={handleMove} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-600 dark:text-rose-400 text-xs">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              ページタイトル
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              スラッグ (URLパス)
            </label>
            <div className="flex items-center">
              <span className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-r-0 border-slate-200 dark:border-slate-700 rounded-l-xl text-xs font-mono text-slate-400 select-none">
                /
              </span>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full text-xs font-mono px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-r-xl focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              変更後URL: <code className="font-mono text-[10px] text-blue-500">{getSitePageHref(siteSlug, slug || '...')}</code>
            </p>
          </div>

          {/* カテゴリ割り当て */}
          <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <FolderTree className="size-3.5 text-amber-500" />
              <span>カテゴリ割り当て (本文を汚さず安全に保持)</span>
            </label>

            {categories.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/60"
                  >
                    <FolderTree className="size-3 text-amber-500" />
                    {cat}
                    <button
                      type="button"
                      onClick={() => handleRemoveCategory(cat)}
                      className="ml-0.5 hover:text-rose-500 cursor-pointer"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400">カテゴリはまだ割り当てられていません</p>
            )}

            <div className="flex gap-1.5">
              <input
                type="text"
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCategory();
                  }
                }}
                placeholder="カテゴリ名を入力して追加..."
                className="flex-1 text-xs px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => handleAddCategory()}
                disabled={!categoryInput.trim()}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
              >
                <Plus className="size-3.5" />
                追加
              </button>
            </div>

            {existingCategories.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 pt-0.5">
                <span className="text-[10px] text-slate-400 mr-1">既存カテゴリ:</span>
                {existingCategories.slice(0, 12).map((c) => {
                  const catName = String(c?.name || c?.category_name || '').trim();
                  if (!catName) return null;
                  const selected = categories.some((item) => item.toLowerCase() === catName.toLowerCase());
                  return (
                    <button
                      key={catName}
                      type="button"
                      onClick={() =>
                        selected ? handleRemoveCategory(catName) : handleAddCategory(catName)
                      }
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                        selected
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-amber-400'
                      }`}
                    >
                      {selected ? '✓ ' : '+ '}
                      {catName}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim() || !slug.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>保存中...</span>
                </>
              ) : (
                <>
                  <ArrowRight className="size-3.5" />
                  <span>変更を保存する</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
