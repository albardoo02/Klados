'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pagesApi, sitesApi } from '@/lib/api';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { MediaLibraryModal } from '@/components/media-library-modal';
import {
  ExternalLink,
  Plus,
  ArrowLeft,
  FileText,
  BarChart3,
  Settings,
  Images,
  Globe,
} from 'lucide-react';

interface Page {
  id: string;
  slug: string;
  title: string;
  status: string;
  updated_at: string;
}

export default function SiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);

  const { data: site } = useQuery({
    queryKey: ['site', id],
    queryFn: () => sitesApi.get(id).then((r) => r.data.data),
  });

  const { data: pages, isLoading } = useQuery({
    queryKey: ['pages', id],
    queryFn: () => pagesApi.list(id).then((r) => r.data.data as Page[]),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ slug: '', title: '' });

  const createMutation = useMutation({
    mutationFn: () => pagesApi.create(id, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages', id] });
      setShowCreate(false);
      setForm({ slug: '', title: '' });
    },
  });

  return (
    <div className="max-w-5xl mx-auto pb-20">
      {/* サイト上部ヘッダー */}
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors mb-3"
        >
          <ArrowLeft className="size-3.5" />
          <span>ダッシュボードに戻る</span>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{site?.title ?? '...'}</h1>
              {site?.is_public ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">
                  公開中
                </span>
              ) : (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                  非公開
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
              <span className="font-mono">{site?.slug}.klados.app</span>
              {site?.custom_domain && (
                <>
                  <span>•</span>
                  <span className="font-mono text-blue-600">{site.custom_domain}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMediaLibraryOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors shadow-2xs cursor-pointer"
            >
              <Images className="size-3.5 text-blue-600" />
              <span>メディア管理</span>
            </button>

            {site?.slug && (
              <Link
                href={`/sites/${site.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors shadow-2xs"
              >
                <span>公開サイトを開く</span>
                <ExternalLink className="size-3.5" />
              </Link>
            )}
          </div>
        </div>

        {/* タブナビゲーション */}
        <div className="flex items-center gap-2 mt-6 border-b border-slate-200 text-sm">
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2.5 font-semibold text-blue-600 border-b-2 border-blue-600"
          >
            <FileText className="size-4" />
            <span>ページ一覧</span>
          </button>
          <button
            type="button"
            onClick={() => setMediaLibraryOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:text-slate-900 transition-colors border-b-2 border-transparent cursor-pointer"
          >
            <Images className="size-4" />
            <span>メディア一覧</span>
          </button>
          <Link
            href={`/dashboard/sites/${id}/analytics`}
            className="flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:text-slate-900 transition-colors border-b-2 border-transparent"
          >
            <BarChart3 className="size-4" />
            <span>アクセス解析</span>
          </Link>
          <Link
            href={`/dashboard/sites/${id}/settings`}
            className="flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:text-slate-900 transition-colors border-b-2 border-transparent"
          >
            <Settings className="size-4" />
            <span>設定</span>
          </Link>
        </div>
      </div>

      {/* ページ一覧コンテンツ */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold">ページ一覧</h2>
          <p className="text-xs text-slate-500">サイト内で公開するドキュメントや記事を管理します</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
        >
          <Plus className="size-3.5" />
          <span>新規ページ作成</span>
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-2xl border p-5 mb-5 shadow-xs animate-in fade-in-0 slide-in-from-top-2">
          <h3 className="font-bold text-sm mb-3">新しいページを作成</h3>
          <div className="space-y-3">
            <input
              placeholder="ページタイトル (例: スタートガイド)"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center">
              <span className="px-3 py-2 bg-slate-100 text-slate-500 text-xs font-mono border border-r-0 rounded-l-xl select-none">
                /
              </span>
              <input
                placeholder="スラッグ (例: guide, about, index)"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                className="w-full border rounded-r-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.title || !form.slug}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer"
              >
                作成して編集を開始
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-20 text-center text-slate-400 text-sm">読み込み中...</div>
      ) : (
        <div className="space-y-2.5">
          {pages?.map((page) => (
            <div
              key={page.id}
              className="flex items-center justify-between bg-white rounded-2xl border px-5 py-4 hover:shadow-sm transition-all group"
            >
              <Link
                href={`/dashboard/pages/${page.id}/edit`}
                className="flex-1 min-w-0"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                    {page.title}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">/{page.slug}</span>
                </div>
                {page.updated_at && (
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    最終更新: {new Date(page.updated_at).toLocaleDateString('ja-JP')}
                  </span>
                )}
              </Link>
              <div className="flex items-center gap-3">
                {page.status === 'published' && site?.slug && (
                  <Link
                    href={`/sites/${site.slug}/${page.slug === 'index' ? '' : page.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    title="公開ページを表示"
                  >
                    <ExternalLink className="size-4" />
                  </Link>
                )}
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    page.status === 'published'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {page.status === 'published' ? '公開中' : '下書き'}
                </span>
              </div>
            </div>
          ))}
          {pages?.length === 0 && (
            <div className="text-center py-16 text-slate-400 text-sm border-2 border-dashed rounded-2xl">
              ページがまだありません。「新規ページ作成」から最初のページを作成してください
            </div>
          )}
        </div>
      )}

      {/* メディアライブラリモーダル */}
      <MediaLibraryModal
        isOpen={mediaLibraryOpen}
        onClose={() => setMediaLibraryOpen(false)}
        siteId={id}
      />
    </div>
  );
}
