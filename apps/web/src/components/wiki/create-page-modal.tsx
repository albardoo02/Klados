'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus, X, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { pagesApi } from '@/lib/api';

interface CreatePageModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteId: string;
  siteSlug: string;
  onCreated?: (pageId: string, slug: string) => void;
}

export function CreatePageModal({
  isOpen,
  onClose,
  siteId,
  siteSlug,
  onCreated,
}: CreatePageModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [category, setCategory] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setSlug('');
      setSlugManuallyEdited(false);
      setCategory('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // タイトル入力からスラッグを推測・自動生成
  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!slugManuallyEdited) {
      const generated = val
        .trim()
        .toLowerCase()
        .replace(/[\s\t\r\n]+/g, '-')
        .replace(/[^\p{L}\p{N}\-_]/gu, '')
        .replace(/^-+|-+$/g, '');
      setSlug(generated);
    }
  };

  const handleSlugChange = (val: string) => {
    setSlug(val);
    setSlugManuallyEdited(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('タイトルを入力してください');
      return;
    }

    let finalSlug = slug.trim();
    if (!finalSlug) {
      finalSlug = title
        .trim()
        .toLowerCase()
        .replace(/[\s\t\r\n]+/g, '-')
        .replace(/[^\p{L}\p{N}\-_]/gu, '')
        .replace(/^-+|-+$/g, '') || `page-${Date.now()}`;
    }

    // 先頭のスラッシュや拡張子の除去
    finalSlug = finalSlug.replace(/^\/+/, '').replace(/\.(?:md|markdown)$/i, '');

    setIsLoading(true);
    setError(null);

    try {
      let initialContent = `# ${title.trim()}\n\nここにコンテンツを入力してください。\n`;
      if (category.trim()) {
        const cats = category
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean);
        if (cats.length > 0) {
          initialContent += '\n' + cats.map((c) => `[[Category:${c}]]`).join('\n') + '\n';
        }
      }

      const res = await pagesApi.create(siteId, {
        title: title.trim(),
        slug: finalSlug,
        content: initialContent,
      });

      const newPage = res.data?.data;
      if (newPage?.id) {
        if (onCreated) {
          onCreated(newPage.id, newPage.slug || finalSlug);
        }
        onClose();
        // 直接エディタ画面へ移動して編集開始
        router.push(`/dashboard/pages/${newPage.id}/edit`);
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'ページの作成に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-0 duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
              <FilePlus className="size-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white">
                新規ページ作成
              </h2>
              <p className="text-xs text-slate-400">新しいWikiページを作成して編集します</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="閉じる"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs flex items-start gap-2">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              ページタイトル <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="例: 第2章 開発環境の構築"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
              autoFocus
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                スラッグ (URL)
              </label>
              <span className="text-[11px] text-slate-400 font-mono">
                /sites/{siteSlug}/...
              </span>
            </div>
            <input
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="例: 02-development-environment"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-sm font-mono text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              ※ 空欄の場合はタイトルから自動生成されます（.mdの入力は不要です）
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              カテゴリ (任意)
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="例: チュートリアル, 初心者向け (カンマ区切り)"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isLoading || !title.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>作成中...</span>
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" />
                  <span>作成して編集</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
