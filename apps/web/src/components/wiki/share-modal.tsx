'use client';

import { useState } from 'react';
import { Share2, X, Copy, Check, QrCode, Smartphone } from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  pageTitle: string;
  siteTitle: string;
}

export function ShareModal({ isOpen, onClose, pageTitle, siteTitle }: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
    currentUrl
  )}&margin=10`;

  const handleCopy = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: pageTitle,
          text: `${pageTitle} - ${siteTitle}`,
          url: currentUrl,
        });
      } catch {
        // User cancelled or share failed
      }
    } else {
      handleCopy();
    }
  };

  const hasNativeShare = typeof navigator !== 'undefined' && Boolean((navigator as any).share);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-sm w-full border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60">
              <Share2 className="size-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">ページの共有</h3>
              <p className="text-xs text-slate-400">QRコードやリンクで共有</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* 本文 */}
        <div className="p-6 space-y-5 text-center">
          {/* QRコード画像 */}
          <div className="flex flex-col items-center justify-center">
            <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-sm inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrUrl}
                alt="ページQRコード"
                width={160}
                height={160}
                className="rounded-lg"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
              <Smartphone className="size-3" />
              <span>スマートフォンで読み取ってアクセス</span>
            </p>
          </div>

          {/* URLコピー */}
          <div className="space-y-1.5 text-left">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              ページのURL
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                readOnly
                value={currentUrl}
                className="w-full text-xs font-mono px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 truncate select-all"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1 shrink-0 transition-colors shadow-xs cursor-pointer"
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                <span>{copied ? 'コピー済' : 'コピー'}</span>
              </button>
            </div>
          </div>

          {/* ネイティブ共有ボタン (対応ブラウザのみ) */}
          {hasNativeShare && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Share2 className="size-3.5" />
              <span>端末の共有メニューを開く</span>
            </button>
          )}
        </div>

        {/* フッター */}
        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
