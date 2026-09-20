'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { categoriesApi, CategoryDetailData, CategoryMemberItem } from '@/lib/api';
import { MarkdownRenderer, extractCategoriesFromMarkdown } from '@/components/markdown-renderer';
import { CategoryBox } from './category-box';
import {
  Folder,
  FolderOpen,
  FileText,
  ChevronRight,
  Edit3,
  Layers,
  Info,
} from 'lucide-react';
import { getSitePrefix, getSitePageHref } from '@/lib/site-url';

interface CategoryViewProps {
  categoryName: string;
  siteSlug: string;
  site: {
    id: string;
    title: string;
    primary_color?: string;
  };
  canEdit?: boolean;
  isDark?: boolean;
  categoryPage?: {
    id: string;
    slug: string;
    title: string;
    content: string;
  } | null;
  allPages?: Array<{
    id: string;
    slug: string;
    title: string;
    content: string;
    status?: string;
  }>;
}

function getInitialChar(text: string): string {
  const trimmed = (text || '').trim();
  if (!trimmed) return '#';
  const char = trimmed[0];

  if (/[a-zA-Z]/.test(char)) {
    return char.toUpperCase();
  }
  if (/[0-9]/.test(char)) {
    return '0-9';
  }

  // Hiragana / Katakana
  const code = char.charCodeAt(0);
  if (code >= 0x30a1 && code <= 0x30f6) {
    // Katakana to Hiragana conversion
    return String.fromCharCode(code - 0x60);
  }

  return char;
}

export function CategoryView({
  categoryName,
  siteSlug,
  site,
  canEdit = false,
  isDark = false,
  categoryPage,
  allPages = [],
}: CategoryViewProps) {
  const brandColor = site.primary_color || '#3b82f6';
  const cleanName = decodeURIComponent(categoryName).replace(/^(?:category|カテゴリ):/i, '');

  // 1. バックエンドからカテゴリ詳細（サブカテゴリ・所属ページ）を取得
  const { data: apiData } = useQuery({
    queryKey: ['public-category', siteSlug, cleanName],
    queryFn: async () => {
      try {
        const res = await categoriesApi.getPublic(siteSlug, cleanName);
        return res.data?.data as CategoryDetailData;
      } catch {
        return null;
      }
    },
    enabled: !!siteSlug && !!cleanName,
  });

  // 2. クライアント側フォールバック（バックエンド未接続時やオフラインプレビュー用）
  const fallbackData = useMemo(() => {
    if (apiData) return null;

    const lowerTarget = cleanName.toLowerCase();
    const subcategories: CategoryMemberItem[] = [];
    const pages: CategoryMemberItem[] = [];
    const groupedPages: Record<string, CategoryMemberItem[]> = {};

    for (const p of allPages) {
      if (p.status && p.status !== 'published') continue;

      const cats = extractCategoriesFromMarkdown(p.content);
      const matched = cats.find((c) => c.name.toLowerCase() === lowerTarget);
      if (matched) {
        const lowerSlug = p.slug.toLowerCase();
        const isCat = lowerSlug.startsWith('category:') || lowerSlug.startsWith('カテゴリ:');
        const sortKey = matched.sortKey || p.title || p.slug;

        const item: CategoryMemberItem = {
          id: p.id,
          slug: p.slug,
          title: p.title,
          sort_key: sortKey,
          is_category: isCat,
        };

        if (isCat) {
          const subName = p.slug.replace(/^(?:category|カテゴリ):/i, '');
          item.category_name = subName;
          subcategories.push(item);
        } else {
          pages.push(item);
          const init = getInitialChar(sortKey);
          if (!groupedPages[init]) groupedPages[init] = [];
          groupedPages[init].push(item);
        }
      }
    }

    // ソート
    pages.sort((a, b) => a.sort_key.localeCompare(b.sort_key, 'ja'));
    subcategories.sort((a, b) => (a.category_name || a.title).localeCompare(b.category_name || b.title, 'ja'));

    return {
      category_name: cleanName,
      page: categoryPage,
      subcategories,
      pages,
      grouped_pages: groupedPages,
      total_pages: pages.length,
      total_subcategories: subcategories.length,
    } as CategoryDetailData;
  }, [apiData, cleanName, allPages, categoryPage]);

  const data = apiData || fallbackData;
  const activeDescPage = data?.page || categoryPage;
  const subcategories = data?.subcategories || [];
  const pages = data?.pages || [];
  const groupedPages = data?.grouped_pages || {};

  // カテゴリページ自身に付与された親カテゴリ（あれば末尾にカテゴリボックス表示）
  const parentCategories = useMemo(() => {
    if (!activeDescPage?.content) return [];
    return extractCategoriesFromMarkdown(activeDescPage.content);
  }, [activeDescPage?.content]);

  // グループ見出し一覧（ソート済み）
  const sortedGroupKeys = useMemo(() => {
    return Object.keys(groupedPages).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [groupedPages]);

  return (
    <div className="space-y-8 animate-in fade-in-0 duration-150">
      {/* パンくずリスト */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
        <Link
          href={getSitePageHref(siteSlug, '')}
          className="hover:underline transition-colors"
          style={{ color: brandColor }}
        >
          {site.title}
        </Link>
        <ChevronRight className="size-3" />
        <Link
          href={`${getSitePrefix(siteSlug)}/Special:Categories`}
          className="hover:underline transition-colors text-slate-500 dark:text-slate-400"
        >
          カテゴリ一覧
        </Link>
        <ChevronRight className="size-3" />
        <span className="text-slate-700 dark:text-slate-200 truncate font-semibold">
          {cleanName}
        </span>
      </div>

      {/* カテゴリヘッダー */}
      <div className="pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-2xl border shrink-0"
              style={{
                backgroundColor: `${brandColor}15`,
                borderColor: `${brandColor}40`,
                color: brandColor,
              }}
            >
              <FolderOpen className="size-7" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                カテゴリ
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {cleanName}
              </h1>
            </div>
          </div>

          {/* 編集ボタン（権限あり） */}
          {canEdit && (
            <div className="flex items-center gap-2">
              {activeDescPage?.id ? (
                <Link
                  href={`/dashboard/pages/${activeDescPage.id}/edit`}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                >
                  <Edit3 className="size-3.5" />
                  <span>説明文を編集</span>
                </Link>
              ) : (
                <Link
                  href={
                    site.id && site.id !== 'demo-site'
                      ? `/dashboard/sites/${site.id}`
                      : '/dashboard'
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 text-xs font-semibold transition-colors"
                >
                  <Edit3 className="size-3.5" />
                  <span>説明文ページを作成</span>
                </Link>
              )}
            </div>
          )}
        </div>

        {/* 概要バッジ */}
        <div className="flex items-center gap-3 mt-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <Layers className="size-3.5 text-slate-400" />
            <span>
              サブカテゴリ: <strong>{subcategories.length}</strong> 件
            </span>
          </span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span className="flex items-center gap-1.5">
            <FileText className="size-3.5 text-slate-400" />
            <span>
              所属ページ: <strong>{pages.length}</strong> 件
            </span>
          </span>
        </div>
      </div>

      {/* カテゴリ説明文エリア */}
      {activeDescPage?.content ? (
        <div className="prose dark:prose-invert max-w-none py-2 border-b border-slate-100 dark:border-slate-800/80">
          <MarkdownRenderer content={activeDescPage.content} siteSlug={siteSlug} />
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Info className="size-4 text-slate-400 shrink-0" />
            <span>このカテゴリには現在説明文が登録されていません。</span>
          </div>
          {canEdit && (
            <Link
              href={
                site.id && site.id !== 'demo-site'
                  ? `/dashboard/sites/${site.id}`
                  : '/dashboard'
              }
              className="font-medium hover:underline text-primary shrink-0"
              style={{ color: brandColor }}
            >
              説明文を作成 →
            </Link>
          )}
        </div>
      )}

      {/* サブカテゴリ一覧セクション */}
      {subcategories.length > 0 && (
        <section className="space-y-3 pt-2">
          <div className="flex items-baseline justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Folder className="size-4 text-primary" style={{ color: brandColor }} />
              <span>サブカテゴリ</span>
              <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                ({subcategories.length}件)
              </span>
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            このカテゴリには以下の {subcategories.length} 件のサブカテゴリが含まれています。
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
            {subcategories.map((sub) => {
              const subName = sub.category_name || sub.title.replace(/^(?:category|カテゴリ):/i, '');
              const subHref = `${getSitePrefix(siteSlug)}/Category:${encodeURIComponent(subName)}`;

              return (
                <Link
                  key={sub.id || sub.slug}
                  href={subHref}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 bg-white dark:bg-slate-900/60 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-all group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Folder className="size-4 text-amber-500 shrink-0" />
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-primary truncate transition-colors">
                      {subName}
                    </span>
                  </div>
                  {sub.member_count !== undefined && sub.member_count > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0 font-medium">
                      {sub.member_count}件
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* カテゴリ所属ページ一覧セクション */}
      <section className="space-y-4 pt-2">
        <div className="flex items-baseline justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="size-4 text-primary" style={{ color: brandColor }} />
            <span>カテゴリ「{cleanName}」にあるページ</span>
            <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
              ({pages.length}件)
            </span>
          </h2>
        </div>

        {pages.length === 0 && subcategories.length === 0 ? (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500 space-y-2">
            <Folder className="size-10 mx-auto stroke-1 text-slate-300 dark:text-slate-600" />
            <p className="text-sm">このカテゴリには現在ページまたはサブカテゴリが含まれていません。</p>
            <p className="text-xs text-slate-400">
              記事の本文に <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px]">[[Category:{cleanName}]]</code> と記述すると、自動的にこの一覧に追加されます。
            </p>
          </div>
        ) : pages.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            このカテゴリに直接属する通常ページはありません（サブカテゴリのみ存在します）。
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              このカテゴリには以下の {pages.length} 件のページが含まれています。
            </p>

            {/* アルファベット・五十音クイックジャンプバー */}
            {sortedGroupKeys.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-xs">
                <span className="text-slate-400 font-bold px-1 select-none">索引:</span>
                {sortedGroupKeys.map((k) => (
                  <a
                    key={k}
                    href={`#cat-group-${k}`}
                    className="size-6 flex items-center justify-center rounded-lg font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-700 dark:text-slate-300"
                    style={{ color: brandColor }}
                  >
                    {k}
                  </a>
                ))}
              </div>
            )}

            {/* グループ別ページリスト */}
            <div className="space-y-6 pt-2">
              {sortedGroupKeys.map((groupKey) => {
                const groupItems = groupedPages[groupKey] || [];

                return (
                  <div key={groupKey} id={`cat-group-${groupKey}`} className="space-y-2 scroll-mt-24">
                    <div className="inline-flex items-center justify-center size-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm font-extrabold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80">
                      {groupKey}
                    </div>

                    <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pl-1">
                      {groupItems.map((item) => {
                        const pageHref = getSitePageHref(siteSlug, item.slug);

                        return (
                          <li key={item.id || item.slug}>
                            <Link
                              href={pageHref}
                              className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 text-sm text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors group"
                            >
                              <FileText className="size-3.5 text-slate-400 group-hover:text-primary shrink-0 transition-colors" />
                              <span className="truncate group-hover:underline">{item.title}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* カテゴリ自身に親カテゴリがある場合のカテゴリボックス */}
      {parentCategories.length > 0 && (
        <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
          <CategoryBox
            categories={parentCategories}
            siteSlug={siteSlug}
            primaryColor={brandColor}
          />
        </div>
      )}
    </div>
  );
}
