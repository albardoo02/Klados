'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ExternalLink, ChevronRight, Plus, Minus } from 'lucide-react';
import { SidebarSection, SidebarLink, containsUrl } from '@/types/sidebar';

interface WikiSidebarTreeProps {
  sections: SidebarSection[];
  currentSlug: string;
  siteSlug: string;
  brandPrimaryColor?: string;
  isDark?: boolean;
  onNavigate?: () => void;
}

export function WikiSidebarTree({
  sections,
  currentSlug,
  siteSlug,
  brandPrimaryColor = '#3b82f6',
  isDark = false,
  onNavigate,
}: WikiSidebarTreeProps) {
  const storageKey = `klados_tree_open_${siteSlug}`;

  // 開閉ステート (キー: item.id または item.title, 値: boolean)
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  // 初期開閉状態の構築
  useEffect(() => {
    let saved: Record<string, boolean> = {};
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) saved = JSON.parse(raw);
      } catch {
        // ignore
      }
    }

    const initial: Record<string, boolean> = { ...saved };

    // ツリーを探索し、未保存の項目に defaultOpen を適用 & 現在のページが含まれる親を展開
    const traverse = (items: SidebarLink[]) => {
      for (const item of items) {
        const key = item.id || item.title;
        const hasChildren = item.children && item.children.length > 0;

        if (hasChildren) {
          if (initial[key] === undefined) {
            initial[key] = item.defaultOpen ?? false;
          }
          // 現在のページがこのフォルダ配下にある場合は強制的に開く
          if (currentSlug && containsUrl(item, currentSlug)) {
            initial[key] = true;
          }
          traverse(item.children!);
        }
      }
    };

    for (const sec of sections) {
      traverse(sec.links);
    }

    setOpenMap(initial);
  }, [sections, storageKey, currentSlug]);

  // 開閉トグルハンドラー
  const toggleItem = useCallback(
    (key: string, e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
      }
      setOpenMap((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(storageKey, JSON.stringify(next));
          } catch {
            // ignore
          }
        }
        return next;
      });
    },
    [storageKey]
  );

  // アイテムが現在のページとしてアクティブか判定
  const isItemActive = useCallback(
    (item: SidebarLink) => {
      const cleanUrl = item.url.replace(/^\//, '');
      const isRoot =
        cleanUrl === '' || cleanUrl === 'index' || cleanUrl === 'home';
      const isCurRoot =
        currentSlug === '' || currentSlug === 'index' || currentSlug === 'home';

      if (isRoot && isCurRoot) return true;
      if (!isRoot && (currentSlug === cleanUrl || currentSlug === `/${cleanUrl}`)) {
        return true;
      }
      return false;
    },
    [currentSlug]
  );

  // ツリー項目の再帰レンダリング
  const renderItem = (item: SidebarLink, depth: number = 0) => {
    const key = item.id || item.title;
    const hasChildren = item.children && item.children.length > 0;
    const isOpen = openMap[key] ?? item.defaultOpen ?? false;
    const isSelected = isItemActive(item);

    const isExternal =
      item.isExternal ||
      /^(?:https?:|\/\/|www\.|mailto:)/i.test(item.url);

    const externalUrl = item.url.startsWith('www.') ? `https://${item.url}` : item.url;

    const cleanUrl = item.url.replace(/^\//, '');
    const pageHref =
      cleanUrl === '' || cleanUrl === 'index' || cleanUrl === 'home'
        ? `/sites/${siteSlug}`
        : `/sites/${siteSlug}/${cleanUrl}`;

    return (
      <div key={key} className="select-none">
        {hasChildren ? (
          // ==============================
          // フォルダ（折りたたみ可能な親項目）
          // ==============================
          <div className="group">
            <div
              className={`flex items-center gap-1.5 py-1 px-1.5 rounded-md text-xs transition-colors ${
                isSelected
                  ? 'bg-blue-50/80 dark:bg-blue-950/40 font-bold'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              {/* SeesaaWiki スタイル スクエア開閉ボタン [+] / [-] */}
              <button
                type="button"
                onClick={(e) => toggleItem(key, e)}
                className="size-4 shrink-0 border border-slate-400/90 dark:border-slate-500 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 flex items-center justify-center rounded-xs shadow-2xs cursor-pointer transition-colors active:scale-95"
                title={isOpen ? '閉じる' : '開く'}
                aria-expanded={isOpen}
              >
                {isOpen ? (
                  <Minus className="size-2.5 text-slate-700 dark:text-slate-300 stroke-[2.5]" />
                ) : (
                  <Plus className="size-2.5 text-slate-700 dark:text-slate-300 stroke-[2.5]" />
                )}
              </button>

              {/* フォルダタイトル（URLが空でなければリンク、空なら行クリックでトグル） */}
              {item.url && item.url !== '#' ? (
                isExternal ? (
                  <a
                    href={externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onNavigate}
                    className="flex-1 truncate text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                  >
                    <span className="truncate">{item.title}</span>
                    <ExternalLink className="size-2.5 text-slate-400 shrink-0" />
                  </a>
                ) : (
                  <Link
                    href={pageHref}
                    onClick={onNavigate}
                    style={isSelected ? { color: brandPrimaryColor } : undefined}
                    className={`flex-1 truncate hover:underline font-medium ${
                      isSelected
                        ? 'font-bold'
                        : 'text-blue-600 dark:text-blue-400'
                    }`}
                  >
                    {item.title}
                  </Link>
                )
              ) : (
                <span
                  onClick={(e) => toggleItem(key, e)}
                  className="flex-1 truncate text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer font-medium"
                >
                  {item.title}
                </span>
              )}
            </div>

            {/* 子要素リスト（開いている場合のみインデントして表示） */}
            {isOpen && (
              <div className="ml-3 pl-2 border-l border-slate-200 dark:border-slate-700/60 space-y-0.5 mt-0.5">
                {item.children!.map((child) => renderItem(child, depth + 1))}
              </div>
            )}
          </div>
        ) : (
          // ==============================
          // 末端のリンク項目 (Bullet付き)
          // ==============================
          <div
            className={`flex items-center gap-1.5 py-1 px-1.5 rounded-md text-xs transition-colors group ${
              isSelected
                ? 'bg-blue-50/80 dark:bg-blue-950/40 font-bold'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            {/* SeesaaWiki ビュレット点 (•) */}
            <span
              className={`size-1 rounded-full shrink-0 ml-1.5 mr-0.5 ${
                isSelected
                  ? 'bg-blue-600 dark:bg-blue-400'
                  : 'bg-slate-400 dark:bg-slate-500'
              }`}
            />

            {isExternal ? (
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onNavigate}
                className="flex-1 truncate text-blue-600 dark:text-blue-400 hover:underline flex items-center justify-between"
              >
                <span className="truncate">{item.title}</span>
                <ExternalLink className="size-2.5 text-slate-400 shrink-0" />
              </a>
            ) : (
              <Link
                href={pageHref}
                onClick={onNavigate}
                style={isSelected ? { color: brandPrimaryColor } : undefined}
                className={`flex-1 truncate hover:underline flex items-center justify-between ${
                  isSelected
                    ? 'font-bold'
                    : 'text-blue-600 dark:text-blue-400'
                }`}
              >
                <span className="truncate">{item.title}</span>
                {isSelected && (
                  <ChevronRight
                    className="size-3 shrink-0"
                    style={{ color: brandPrimaryColor }}
                  />
                )}
              </Link>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 font-sans">
      {sections.map((sec) => (
        <div key={sec.id} className="space-y-1">
          {/* SeesaaWiki スタイル セクション見出しグレーバー */}
          {sec.title && (
            <div className="bg-slate-200/90 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs px-2.5 py-1.5 rounded-xs border-y border-slate-300/80 dark:border-slate-700/80 tracking-wide flex items-center justify-between">
              <span>{sec.title}</span>
            </div>
          )}

          {/* セクション配下のツリーリンク */}
          <nav className="space-y-0.5 px-0.5 pt-0.5">
            {sec.links.map((link) => renderItem(link, 0))}
          </nav>
        </div>
      ))}
    </div>
  );
}
