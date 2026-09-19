'use client';

import { X, Code2, Copy, Check, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';

interface PageSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  page: {
    id: string;
    slug: string;
    title: string;
    content: string;
  };
}

export function PageSourceModal({ isOpen, onClose, page }: PageSourceModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(page.content || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-3xl w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2 font-bold text-base text-slate-900 dark:text-white">
            <Code2 className="size-5 text-indigo-600 dark:text-indigo-400" />
            <span>ソースを表示: {page.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="size-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">コピーしました</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5 text-slate-500" />
                  <span>ソースをコピー</span>
                </>
              )}
            </button>
            <Link
              href={`/dashboard/pages/${page.id}/edit`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              <span>エディタで編集</span>
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

        <div className="p-4 bg-slate-900 text-slate-100 flex-1 overflow-auto font-mono text-xs leading-relaxed selection:bg-blue-600">
          <pre className="whitespace-pre-wrap break-words">{page.content || '(空のページ)'}</pre>
        </div>

        <div className="px-6 py-2.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
          <span>{page.content ? page.content.length.toLocaleString() : 0} 文字 / {page.content ? page.content.split('\n').length : 0} 行</span>
          <span>Markdownソース形式</span>
        </div>
      </div>
    </div>
  );
}
