'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { sitesApi } from '@/lib/api';
import {
  Search,
  FileText,
  Globe,
  CornerDownLeft,
  X,
  Loader2,
  KeyRound,
  LayoutDashboard,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export interface SearchResultItem {
  id: string;
  site_id?: string;
  slug: string;
  title: string;
  snippet?: string;
  highlight?: string;
  status?: string;
  type?: 'page' | 'site' | 'action';
  href?: string;
}

interface CommandPaletteProps {
  siteId?: string;
  siteSlug?: string;
  isOpen?: boolean;
  onClose?: () => void;
  pages?: Array<{ id: string; slug: string; title: string; content?: string }>;
  canEdit?: boolean;
  isGuest?: boolean;
}

export function CommandPalette({
  siteId,
  siteSlug,
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
  pages: initialPages,
  canEdit = false,
  isGuest = false,
}: CommandPaletteProps) {
  const router = useRouter();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  const handleClose = () => {
    if (controlledOnClose) {
      controlledOnClose();
    } else {
      setInternalIsOpen(false);
    }
  };

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // グローバルショートカット (Ctrl+K / Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (controlledIsOpen !== undefined && controlledOnClose) {
          controlledOnClose();
        } else {
          setInternalIsOpen((prev) => !prev);
        }
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        handleClose();
      }
    };

    const handleCustomOpen = () => {
      if (controlledIsOpen === undefined) {
        setInternalIsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('klados:open-search', handleCustomOpen);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('klados:open-search', handleCustomOpen);
    };
  }, [isOpen, controlledIsOpen, controlledOnClose]);

  // モーダルが開いた際に入力フィールドへフォーカス
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      setSelectedIndex(0);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  // デフォルトのアクション一覧（権限・閲覧モードに応じた最適化）
  const quickActions = useMemo<SearchResultItem[]>(() => {
    const actions: SearchResultItem[] = [];

    if (siteSlug) {
      // 公開サイト閲覧中
      actions.push({
        id: 'action-public-root',
        title: `公開サイトのトップ (${siteSlug})`,
        slug: 'home',
        type: 'action',
        snippet: '公開中のトップページを表示',
        href: `/sites/${siteSlug}`,
      });

      if (canEdit) {
        // サイト関係者・編集者の場合のみ管理アクションを表示
        if (siteId) {
          actions.push({
            id: 'action-site-manage',
            title: 'サイト管理ダッシュボード',
            slug: 'dashboard/sites',
            type: 'action',
            snippet: 'ページの追加・削除、設定変更、分析を確認',
            href: `/dashboard/sites/${siteId}`,
          });
        }
        actions.push({
          id: 'action-dashboard',
          title: 'ダッシュボード ホーム',
          slug: 'dashboard',
          type: 'action',
          snippet: 'サイト一覧やアカウントの管理',
          href: '/dashboard',
        });
      } else if (isGuest) {
        // ゲストユーザー向けの親切なアクション
        actions.push(
          {
            id: 'action-login',
            title: 'ログイン',
            slug: 'login',
            type: 'action',
            snippet: 'アカウントにログインして編集権限を確認',
            href: '/login',
          },
          {
            id: 'action-register',
            title: 'アカウント作成 (無料)',
            slug: 'register',
            type: 'action',
            snippet: '新規登録して自分専用のWikiサイトを作成',
            href: '/register',
          }
        );
      }
    } else {
      // ダッシュボードなど管理者画面の場合
      actions.push(
        {
          id: 'action-dashboard',
          title: 'ダッシュボード ホーム',
          slug: 'dashboard',
          type: 'action',
          snippet: 'サイト一覧やアカウントの管理',
          href: '/dashboard',
        },
        {
          id: 'action-api-keys',
          title: '開発者 API キー設定',
          slug: 'settings/api-keys',
          type: 'action',
          snippet: '外部連携用の REST API トークンを発行・管理',
          href: '/dashboard/settings/api-keys',
        }
      );
    }

    return actions;
  }, [siteSlug, siteId, canEdit, isGuest]);

  // 検索クエリ実行 (デバウンス)
  useEffect(() => {
    if (!isOpen) return;

    if (!query.trim()) {
      // クエリが空の場合はクイックアクションを表示
      setResults(quickActions);
      setSelectedIndex(0);
      setIsLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const lowerQ = query.toLowerCase();
        let matched: SearchResultItem[] = [];

        if (siteId) {
          try {
            const res = await sitesApi.search(siteId, query);
            if (res.data?.data && Array.isArray(res.data.data) && res.data.data.length > 0) {
              matched = res.data.data.map((item: any) => ({
                id: item.id,
                site_id: item.site_id,
                slug: item.slug,
                title: item.title,
                snippet: item.snippet,
                highlight: item.highlight,
                status: item.status,
                type: 'page',
                href: siteSlug
                  ? `/sites/${siteSlug}/${item.slug === 'index' ? '' : item.slug}`
                  : `/dashboard/pages/${item.id}/edit`,
              }));
            }
          } catch {
            // API search failed or 404, fallback to client filtering
          }
        }

        // initialPages が渡されている場合（または API から結果が取れなかった場合）のクライアント側フォールバック
        if (matched.length === 0 && initialPages && initialPages.length > 0) {
          const clientMatches = initialPages.filter(
            (p) =>
              p.title.toLowerCase().includes(lowerQ) ||
              (p.content && p.content.toLowerCase().includes(lowerQ)) ||
              p.slug.toLowerCase().includes(lowerQ)
          );

          matched = clientMatches.map((p) => {
            const content = p.content || '';
            const idx = content.toLowerCase().indexOf(lowerQ);
            let snippet = '';
            if (idx !== -1) {
              const start = Math.max(0, idx - 40);
              const end = Math.min(content.length, idx + query.length + 60);
              snippet = (start > 0 ? '...' : '') + content.slice(start, end).trim() + (end < content.length ? '...' : '');
            } else {
              snippet = content.slice(0, 100) + (content.length > 100 ? '...' : '');
            }

            return {
              id: p.id,
              slug: p.slug,
              title: p.title,
              snippet: snippet || p.title,
              type: 'page',
              href: siteSlug
                ? `/sites/${siteSlug}/${p.slug === 'index' ? '' : p.slug}`
                : `/dashboard/pages/${p.id}/edit`,
            };
          });
        }

        // siteId もなく初期ページもない場合はユーザーの全サイト一覧を検索
        if (matched.length === 0 && !siteId) {
          try {
            const res = await sitesApi.list();
            const sites = res.data?.data || [];
            const siteMatches = sites.filter(
              (s: any) =>
                s.title?.toLowerCase().includes(lowerQ) ||
                s.slug?.toLowerCase().includes(lowerQ) ||
                s.description?.toLowerCase().includes(lowerQ)
            );
            matched = siteMatches.map((s: any) => ({
              id: s.id,
              slug: s.slug,
              title: s.title,
              snippet: s.description || `${s.slug}.klados.app`,
              type: 'site',
              href: `/dashboard/sites/${s.id}`,
            }));
          } catch {
            // ignore
          }
        }

        // クイックアクションもクエリでマッチ
        const matchedActions = quickActions.filter(
          (a) =>
            a.title.toLowerCase().includes(lowerQ) ||
            a.snippet?.toLowerCase().includes(lowerQ) ||
            a.slug.toLowerCase().includes(lowerQ)
        );

        setResults([...matched, ...matchedActions]);
        setSelectedIndex(0);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, isOpen, siteId, siteSlug, quickActions, initialPages]);

  // キーボードナビゲーション
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = results[selectedIndex];
      if (current) {
        executeSelection(current);
      }
    }
  };

  // 選択されたアイテムへのナビゲーション
  const executeSelection = (item: SearchResultItem) => {
    handleClose();
    if (item.href) {
      router.push(item.href);
    } else if (item.type === 'page') {
      if (siteSlug) {
        router.push(`/sites/${siteSlug}/${item.slug === 'index' ? '' : item.slug}`);
      } else {
        router.push(`/dashboard/pages/${item.id}/edit`);
      }
    } else if (item.type === 'site') {
      router.push(`/dashboard/sites/${item.id}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-150"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-2xl bg-card text-card-foreground border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 検索バー入力ヘッダー */}
        <div className="flex items-center px-4 py-3.5 border-b border-border bg-muted/20 gap-3">
          <Search className="size-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              siteSlug
                ? `"${siteSlug}" 内のドキュメント・見出し・本文を検索...`
                : 'ページ、サイト、コマンドを検索... (例: ガイド, API, 設定)'
            }
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm focus:outline-none"
          />
          {isLoading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
          ) : query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="size-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[11px] font-mono text-muted-foreground bg-muted border border-border rounded">
              ESC
            </kbd>
          )}
        </div>

        {/* 検索結果リスト */}
        <div
          ref={resultsContainerRef}
          className="flex-1 overflow-y-auto p-2 divide-y divide-border/40 max-h-[500px]"
        >
          {results.length > 0 ? (
            <div className="space-y-1">
              {results.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={`${item.type}-${item.id}-${idx}`}
                    type="button"
                    onClick={() => executeSelection(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full text-left p-3 rounded-xl transition-colors flex items-start gap-3 cursor-pointer group ${
                      isSelected
                        ? 'bg-primary/10 text-foreground border border-primary/30'
                        : 'hover:bg-muted/50 text-muted-foreground border border-transparent'
                    }`}
                  >
                    <div
                      className={`size-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        item.type === 'site'
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : item.type === 'action'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {item.type === 'site' ? (
                        <Globe className="size-4" />
                      ) : item.type === 'action' ? (
                        item.id.includes('api') ? (
                          <KeyRound className="size-4" />
                        ) : (
                          <LayoutDashboard className="size-4" />
                        )
                      ) : (
                        <FileText className="size-4" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors truncate">
                          {item.title}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.slug && (
                            <span className="text-[11px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                              /{item.slug}
                            </span>
                          )}
                          {item.status && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                item.status === 'published'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                            >
                              {item.status === 'published' ? '公開' : '下書き'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* スニペットプレビュー */}
                      {item.highlight ? (
                        <div
                          className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed [&_mark]:bg-amber-200 dark:[&_mark]:bg-amber-800/60 dark:[&_mark]:text-amber-100 [&_mark]:px-1 [&_mark]:rounded"
                          dangerouslySetInnerHTML={{ __html: item.highlight }}
                        />
                      ) : item.snippet ? (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                          {item.snippet}
                        </p>
                      ) : null}
                    </div>

                    <div className="shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : query && !isLoading ? (
            <div className="py-16 text-center text-muted-foreground space-y-2">
              <Search className="size-8 mx-auto stroke-[1.5] text-muted-foreground/50 mb-1" />
              <p className="text-sm font-semibold">該当するページが見つかりませんでした</p>
              <p className="text-xs text-muted-foreground/80">
                キーワードを変えるか、別の検索語を試してください
              </p>
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground text-xs">
              検索ワードを入力してください
            </div>
          )}
        </div>

        {/* コマンドパレット フッター */}
        <div className="px-4 py-2.5 bg-muted/40 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-background border border-border rounded text-[10px] font-mono">
                ↑
              </kbd>
              <kbd className="px-1.5 py-0.5 bg-background border border-border rounded text-[10px] font-mono">
                ↓
              </kbd>
              <span>で移動</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-background border border-border rounded text-[10px] font-mono flex items-center">
                <CornerDownLeft className="size-2.5" />
              </kbd>
              <span>で選択</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3 text-amber-500" />
            <span>Klados Search v3</span>
          </div>
        </div>
      </div>
    </div>
  );
}
