'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pagesApi, PageItem } from '@/lib/api';
import {
  Search,
  FileText,
  Link as LinkIcon,
  X,
  Plus,
  ArrowRight,
  ExternalLink,
  Check,
} from 'lucide-react';

interface InternalLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteId?: string;
  currentPageId?: string;
  initialSelectedText?: string;
  onInsertLink: (linkSyntax: string) => void;
}

export function InternalLinkModal({
  isOpen,
  onClose,
  siteId,
  currentPageId,
  initialSelectedText = '',
  onInsertLink,
}: InternalLinkModalProps) {
  const [searchQuery, setSearchQuery] = useState(initialSelectedText);
  const [displayText, setDisplayText] = useState(initialSelectedText);
  const [linkFormat, setLinkFormat] = useState<'wiki' | 'markdown'>('wiki');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // サイト内のページ一覧を取得
  const { data: pages = [], isLoading } = useQuery<PageItem[]>({
    queryKey: ['site-pages', siteId],
    queryFn: async () => {
      if (!siteId) return [];
      const res = await pagesApi.list(siteId);
      return res.data?.data || [];
    },
    enabled: isOpen && Boolean(siteId),
  });

  // モーダルオープン時の初期化
  useEffect(() => {
    if (isOpen) {
      setSearchQuery(initialSelectedText);
      setDisplayText(initialSelectedText);
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, initialSelectedText]);

  // 検索フィルタリング（タイトルまたはスラッグ）
  const filteredPages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter(
      (p) =>
        (p.title && p.title.toLowerCase().includes(q)) ||
        (p.slug && p.slug.toLowerCase().includes(q))
    );
  }, [pages, searchQuery]);

  // リンク挿入の実行
  const handleSelectPage = (targetPage: PageItem) => {
    const title = targetPage.title || targetPage.slug;
    const slug = targetPage.slug.replace(/^\//, '');
    let syntax = '';

    if (linkFormat === 'wiki') {
      if (displayText.trim() && displayText.trim() !== title) {
        syntax = `[[${title}|${displayText.trim()}]]`;
      } else {
        syntax = `[[${title}]]`;
      }
    } else {
      // Markdown リンク形式
      const label = displayText.trim() || title;
      syntax = `[${label}](/${slug})`;
    }

    onInsertLink(syntax);
    onClose();
  };

  // 検索ワードから新規ページリンクを直接作成
  const handleCustomLink = () => {
    const word = searchQuery.trim();
    if (!word) return;
    let syntax = '';
    if (linkFormat === 'wiki') {
      if (displayText.trim() && displayText.trim() !== word) {
        syntax = `[[${word}|${displayText.trim()}]]`;
      } else {
        syntax = `[[${word}]]`;
      }
    } else {
      const label = displayText.trim() || word;
      syntax = `[${label}](/${encodeURIComponent(word)})`;
    }
    onInsertLink(syntax);
    onClose();
  };

  // キーボードナビゲーション
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < filteredPages.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredPages.length > 0 && filteredPages[selectedIndex]) {
        handleSelectPage(filteredPages[selectedIndex]);
      } else if (searchQuery.trim()) {
        handleCustomLink();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in-0 duration-150"
      onClick={onClose}
    >
      <div
        className="bg-card text-card-foreground w-full max-w-xl rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <LinkIcon className="size-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-none">内部リンクの挿入</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                サイト内の既存ページを検索してリンクを作成します
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 検索入力 & 設定エリア */}
        <div className="p-4 space-y-3 border-b border-border bg-background">
          <div className="relative">
            <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder="ページタイトルまたはスラッグを入力して検索..."
              className="w-full pl-9 pr-3.5 py-2 text-sm bg-muted/40 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
            />
          </div>

          <div className="flex items-center justify-between text-xs gap-3 pt-1">
            {/* 表示テキスト任意指定 */}
            <div className="flex-1 flex items-center gap-2">
              <span className="text-muted-foreground shrink-0 font-medium">表示テキスト:</span>
              <input
                type="text"
                value={displayText}
                onChange={(e) => setDisplayText(e.target.value)}
                placeholder="（省略時はページタイトル）"
                className="w-full px-2.5 py-1 text-xs bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* 記法切り替え */}
            <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border border-border shrink-0">
              <button
                type="button"
                onClick={() => setLinkFormat('wiki')}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                  linkFormat === 'wiki'
                    ? 'bg-background shadow-xs text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Wiki形式: [[ページ名]]"
              >
                [[Wiki]]
              </button>
              <button
                type="button"
                onClick={() => setLinkFormat('markdown')}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                  linkFormat === 'markdown'
                    ? 'bg-background shadow-xs text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Markdown形式: [テキスト](/slug)"
              >
                [Markdown]
              </button>
            </div>
          </div>
        </div>

        {/* ページ一覧リスト */}
        <div className="max-h-64 min-h-40 overflow-y-auto p-2 space-y-1">
          {isLoading ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              ページ一覧を読み込み中...
            </div>
          ) : filteredPages.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <p className="text-xs text-muted-foreground">
                一致するページが見つかりませんでした
              </p>
              {searchQuery.trim() && (
                <button
                  type="button"
                  onClick={handleCustomLink}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  <span>「{searchQuery.trim()}」へのリンクを作成</span>
                </button>
              )}
            </div>
          ) : (
            filteredPages.map((p, idx) => {
              const isCurrent = p.id === currentPageId;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={p.id}
                  onClick={() => handleSelectPage(p)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-2.5 rounded-xl text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'hover:bg-muted/50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className={`size-4 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground truncate">
                          {p.title || '無題のページ'}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                            現在編集中
                          </span>
                        )}
                        {p.status === 'draft' && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                            下書き
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground block truncate">
                        /{p.slug}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-mono text-muted-foreground/70 hidden sm:inline">
                      {linkFormat === 'wiki'
                        ? displayText.trim()
                          ? `[[${p.title}|${displayText.trim()}]]`
                          : `[[${p.title}]]`
                        : `[${displayText.trim() || p.title}](/${p.slug})`}
                    </span>
                    <ArrowRight className={`size-3.5 ${isSelected ? 'text-primary' : 'text-muted-foreground/40'}`} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* フッター */}
        <div className="px-5 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>↑↓: 選択</span>
            <span>Enter: 挿入</span>
            <span>Esc: 閉じる</span>
          </div>
          {searchQuery.trim() && (
            <button
              type="button"
              onClick={handleCustomLink}
              className="text-primary hover:underline font-medium cursor-pointer"
            >
              未作成ページ「{searchQuery.trim()}」として挿入
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
