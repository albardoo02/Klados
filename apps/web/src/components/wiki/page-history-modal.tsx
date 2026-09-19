'use client';

import { useQuery } from '@tanstack/react-query';
import { pagesApi, PageVersion } from '@/lib/api';
import { useState } from 'react';
import { X, History, Clock, FileText, ArrowLeftRight, Check, RotateCcw, ExternalLink } from 'lucide-react';
import { DiffViewer } from '@/components/diff-viewer';
import Link from 'next/link';

interface PageHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  page: {
    id: string;
    slug: string;
    title: string;
    content: string;
    updated_at?: string;
  };
}

export function PageHistoryModal({ isOpen, onClose, page }: PageHistoryModalProps) {
  const [selectedVersion, setSelectedVersion] = useState<PageVersion | null>(null);
  const [compareMode, setCompareMode] = useState<'with-current' | 'raw'>('with-current');

  const { data: versions = [], isLoading } = useQuery<PageVersion[]>({
    queryKey: ['page-versions', page.id],
    queryFn: async () => {
      try {
        const res = await pagesApi.versions(page.id);
        if (res.data?.data && Array.isArray(res.data.data)) {
          return res.data.data;
        }
      } catch {
        // Fallback
      }
      // デモ/フォールバック: 過去版がまだ無い場合は現在版のみを配列で返す
      return [
        {
          id: 'v-curr',
          page_id: page.id,
          content: page.content,
          version: 1,
          created_at: page.updated_at || new Date().toISOString(),
        },
      ];
    },
    enabled: isOpen && !!page.id,
  });

  if (!isOpen) return null;

  const currentVersionNum = versions.length > 0 ? Math.max(...versions.map((v) => v.version)) : 1;
  const activeVersion = selectedVersion || versions[0] || null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-5xl w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-[85vh] animate-in fade-in-0 zoom-in-95 duration-150">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
              <History className="size-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <span>版の履歴: {page.title}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-normal font-mono">
                  全 {versions.length} 版
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                過去の編集履歴や差分を確認できます
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/pages/${page.id}/edit`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              <span>エディタで復元/編集</span>
              <ExternalLink className="size-3" />
            </Link>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer ml-1"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* コンテンツ 2カラム構成 */}
        <div className="flex-1 flex min-h-0 divide-x divide-slate-100 dark:divide-slate-800">
          {/* 左カラム: バージョン一覧リスト */}
          <div className="w-72 sm:w-80 shrink-0 flex flex-col bg-slate-50/50 dark:bg-slate-950/40">
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              更新履歴タイムライン
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {isLoading ? (
                <div className="p-6 text-center text-xs text-slate-400">読み込み中...</div>
              ) : versions.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">履歴がありません</div>
              ) : (
                versions.map((v, idx) => {
                  const isSelected = activeVersion?.id === v.id;
                  const isLatest = idx === 0;

                  return (
                    <button
                      key={v.id || idx}
                      onClick={() => setSelectedVersion(v)}
                      className={`w-full text-left p-3 rounded-xl transition-all flex flex-col gap-1 border cursor-pointer ${
                        isSelected
                          ? 'bg-white dark:bg-slate-800 border-blue-500/50 shadow-xs'
                          : 'border-transparent hover:bg-white/60 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs font-mono text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <span>第 {v.version} 版</span>
                          {isLatest && (
                            <span className="text-[10px] font-sans px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">
                              現在
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {v.content ? `${v.content.length.toLocaleString()} 字` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Clock className="size-3" />
                        <span>{new Date(v.created_at).toLocaleString('ja-JP')}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* 右カラム: 選択したバージョンの差分・プレビュー */}
          <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900">
            {activeVersion ? (
              <>
                <div className="px-6 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs shrink-0">
                  <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                    <span>表示中: 第 {activeVersion.version} 版</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-400 font-normal">
                      {new Date(activeVersion.created_at).toLocaleString('ja-JP')}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-medium">
                    <button
                      onClick={() => setCompareMode('with-current')}
                      className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                        compareMode === 'with-current'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      現在版との差分 (Diff)
                    </button>
                    <button
                      onClick={() => setCompareMode('raw')}
                      className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                        compareMode === 'raw'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      この版の内容
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-4">
                  {compareMode === 'with-current' ? (
                    <DiffViewer
                      oldText={activeVersion.content || ''}
                      newText={page.content || ''}
                      oldTitle={`第 ${activeVersion.version} 版 (${new Date(activeVersion.created_at).toLocaleDateString('ja-JP')})`}
                      newTitle="現在の最新版"
                      initialMode="side-by-side"
                    />
                  ) : (
                    <div className="p-4 bg-slate-950 text-slate-100 rounded-xl font-mono text-xs leading-relaxed overflow-x-auto">
                      <pre className="whitespace-pre-wrap break-words">{activeVersion.content || '(空)'}</pre>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                バージョンを選択してください
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
