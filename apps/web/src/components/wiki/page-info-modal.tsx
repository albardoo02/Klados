'use client';

import { X, FileText, Calendar, Clock, Hash, Link as LinkIcon, Check } from 'lucide-react';
import { useState } from 'react';

interface PageInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  page: {
    id: string;
    slug: string;
    title: string;
    content: string;
    created_at?: string;
    updated_at?: string;
  };
  site: {
    title: string;
    slug: string;
  };
}

export function PageInfoModal({ isOpen, onClose, page, site }: PageInfoModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const charCount = page.content ? page.content.length : 0;
  const lineCount = page.content ? page.content.split('\n').length : 0;
  const wordCount = page.content
    ? page.content.trim().split(/\s+/).filter(Boolean).length
    : 0;

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 font-bold text-base text-slate-900 dark:text-white">
            <FileText className="size-5 text-blue-600 dark:text-blue-400" />
            <span>ページ情報: {page.title}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-sm text-slate-700 dark:text-slate-300">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-400 block mb-1">ページタイトル</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{page.title}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-400 block mb-1">スラグ (パス)</span>
              <span className="font-mono text-xs text-blue-600 dark:text-blue-400">{page.slug || '(index)'}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-center">
              <span className="text-xs text-slate-400 block mb-1">総文字数</span>
              <span className="font-bold text-lg text-slate-800 dark:text-slate-100">{charCount.toLocaleString()}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-center">
              <span className="text-xs text-slate-400 block mb-1">総行数</span>
              <span className="font-bold text-lg text-slate-800 dark:text-slate-100">{lineCount.toLocaleString()}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-center">
              <span className="text-xs text-slate-400 block mb-1">単語数</span>
              <span className="font-bold text-lg text-slate-800 dark:text-slate-100">{wordCount.toLocaleString()}</span>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            {page.created_at && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Calendar className="size-3.5" /> 作成日時:
                </span>
                <span className="font-mono">{new Date(page.created_at).toLocaleString('ja-JP')}</span>
              </div>
            )}
            {page.updated_at && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Clock className="size-3.5" /> 最終更新日時:
                </span>
                <span className="font-mono">{new Date(page.updated_at).toLocaleString('ja-JP')}</span>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              onClick={handleCopyLink}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-xs transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="size-4 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">固定リンクをコピーしました</span>
                </>
              ) : (
                <>
                  <LinkIcon className="size-4 text-slate-400" />
                  <span>このページの固定リンクをコピー</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
