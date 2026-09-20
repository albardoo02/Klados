'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { categoriesApi, CategorySummary } from '@/lib/api';
import { extractCategoriesFromMarkdown } from '@/components/markdown-renderer';
import {
  FolderTree,
  Folder,
  Search,
  ChevronRight,
} from 'lucide-react';

interface SpecialCategoriesViewProps {
  siteSlug: string;
  site: {
    id: string;
    title: string;
    primary_color?: string;
  };
  isDark?: boolean;
  allPages?: Array<{
    id: string;
    slug: string;
    title: string;
    content: string;
    status?: string;
  }>;
}

export function SpecialCategoriesView({
  siteSlug,
  site,
  allPages = [],
}: SpecialCategoriesViewProps) {
  const brandColor = site.primary_color || '#3b82f6';
  const [searchTerm, setSearchTerm] = useState('');

  // 1. バックエンドから全カテゴリ一覧を取得
  const { data: apiCategories } = useQuery({
    queryKey: ['public-categories', siteSlug],
    queryFn: async () => {
      try {
        const res = await categoriesApi.listPublic(siteSlug);
        return res.data?.data as CategorySummary[];
      } catch {
        return null;
      }
    },
    enabled: !!siteSlug,
  });

  // 2. クライアント側フォールバック（デモサイトやオフラインプレビュー用）
  const fallbackCategories = useMemo(() => {
    if (apiCategories) return null;

    const catMap = new Map<string, { pageCount: number; subCount: number }>();

    for (const p of allPages) {
      if (p.status && p.status !== 'published') continue;
      const cats = extractCategoriesFromMarkdown(p.content);
      const isCat = p.slug.toLowerCase().startsWith('category:') || p.slug.toLowerCase().startsWith('カテゴリ:');

      for (const c of cats) {
        const existing = catMap.get(c.name) || { pageCount: 0, subCount: 0 };
        if (isCat) {
          existing.subCount++;
        } else {
          existing.pageCount++;
        }
        catMap.set(c.name, existing);
      }
    }

    const list: CategorySummary[] = [];
    catMap.forEach((val, name) => {
      list.push({
        name,
        page_count: val.pageCount,
        subcategory_count: val.subCount,
        total_count: val.pageCount + val.subCount,
      });
    });

    list.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    return list;
  }, [apiCategories, allPages]);

  const categories = useMemo(() => {
    return apiCategories || fallbackCategories || [];
  }, [apiCategories, fallbackCategories]);

  // 検索フィルタ
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return categories;
    const q = searchTerm.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, searchTerm]);

  return (
    <div className="space-y-8 animate-in fade-in-0 duration-150">
      {/* パンくずリスト */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
        <Link
          href={`/sites/${siteSlug}`}
          className="hover:underline transition-colors"
          style={{ color: brandColor }}
        >
          {site.title}
        </Link>
        <ChevronRight className="size-3" />
        <span className="text-slate-700 dark:text-slate-200 truncate font-semibold">
          特別:カテゴリ一覧
        </span>
      </div>

      {/* ヘッダー */}
      <div className="pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div
            className="p-2.5 rounded-2xl border shrink-0"
            style={{
              backgroundColor: `${brandColor}15`,
              borderColor: `${brandColor}40`,
              color: brandColor,
            }}
          >
            <FolderTree className="size-7" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              特別ページ (Special)
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              カテゴリ一覧
            </h1>
          </div>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400 mt-3 max-w-2xl">
          サイト「{site.title}」で使用されているすべてのカテゴリです。各カテゴリをクリックすると、所属するページやサブカテゴリの一覧が表示されます。
        </p>

        {/* 検索バー */}
        <div className="relative mt-5 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <input
            type="text"
            placeholder="カテゴリ名で絞り込み..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      {/* カテゴリグリッド */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((cat) => {
            const href = `/sites/${siteSlug}/Category:${encodeURIComponent(cat.name)}`;

            return (
              <Link
                key={cat.name}
                href={href}
                className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800/40 hover:border-blue-300 dark:hover:border-blue-600/60 transition-all group shadow-2xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="p-2 rounded-xl shrink-0 group-hover:scale-105 transition-transform"
                    style={{
                      backgroundColor: `${brandColor}15`,
                      color: brandColor,
                    }}
                  >
                    <Folder className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-800 dark:text-slate-100 group-hover:text-primary transition-colors truncate">
                      {cat.name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                      <span>{cat.page_count} 件のページ</span>
                      {cat.subcategory_count > 0 && (
                        <>
                          <span>•</span>
                          <span>{cat.subcategory_count} 件のサブカテゴリ</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <ChevronRight className="size-4 text-slate-300 dark:text-slate-600 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="py-16 text-center space-y-3">
          <FolderTree className="size-12 mx-auto text-slate-300 dark:text-slate-600 stroke-1" />
          <h3 className="font-bold text-base text-slate-700 dark:text-slate-300">
            {searchTerm ? '一致するカテゴリが見つかりませんでした' : 'カテゴリがまだ作成されていません'}
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm mx-auto">
            {searchTerm
              ? '検索条件を変更してお試しください。'
              : 'Markdown記事の本文に [[Category:カテゴリ名]] または [[カテゴリ:カテゴリ名]] を記述すると自動的に分類されます。'}
          </p>
        </div>
      )}
    </div>
  );
}
