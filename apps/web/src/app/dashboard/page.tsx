'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sitesApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import Link from 'next/link';
import { useState } from 'react';
import { Sparkles, AlertCircle, CheckCircle2, Globe, FileText, Infinity, X } from 'lucide-react';

interface Site {
  id: string;
  slug: string;
  title: string;
  description: string;
  theme: string;
  is_public: boolean;
  role?: string;
  is_owner?: boolean;
  created_at: string;
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { data, isLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list().then((r) => r.data.data as Site[]),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ slug: '', title: '', description: '' });
  const [errorMessage, setErrorMessage] = useState('');
  const [showPlanModal, setShowPlanModal] = useState(false);

  const ownedSites = data?.filter((s) => s.is_owner !== false) || [];
  const siteCount = ownedSites.length;
  const isFreePlan = !user?.plan || user?.plan === 'free';
  const hasReachedSiteLimit = isFreePlan && siteCount >= 1;

  const createMutation = useMutation({
    mutationFn: () => sitesApi.create(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      setShowCreate(false);
      setForm({ slug: '', title: '', description: '' });
      setErrorMessage('');
    },
    onError: (err: any) => {
      setErrorMessage(
        err?.response?.data?.error || 'サイトの作成に失敗しました'
      );
    },
  });

  const handleOpenCreate = () => {
    if (hasReachedSiteLimit) {
      setShowPlanModal(true);
    } else {
      setErrorMessage('');
      setShowCreate(true);
    }
  };

  if (isLoading) {
    return <div className="text-center py-20 text-slate-400">読み込み中...</div>;
  }

  return (
    <div className="space-y-6">
      {/* プラン制限・機能ステータスバナー */}
      <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-blue-200/60 dark:border-blue-800/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2.5 bg-blue-500/15 text-blue-600 dark:text-blue-400 rounded-xl">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 dark:text-white">
                {isFreePlan ? 'Freeプラン（オープンベータ）' : 'Proプラン'}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 font-medium">
                サイト数: {siteCount} / {isFreePlan ? '1' : '無制限'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              当面の間はサイト数上限（1サイト）を除き、<strong>ページ作成・カスタムドメイン・テーマ・共同編集などの全機能が無制限</strong>でご利用いただけます。
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowPlanModal(true)}
          className="shrink-0 text-xs sm:text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 self-start sm:self-auto"
        >
          プラン詳細を見る →
        </button>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">マイサイト</h1>
        <button
          onClick={handleOpenCreate}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm flex items-center gap-1.5"
        >
          <span>+</span> 新規サイト作成
        </button>
      </div>

      {showCreate && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-4">新規サイト作成</h2>
          {errorMessage && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                サイト名 <span className="text-red-500">*</span>
              </label>
              <input
                placeholder="例: マイ技術ブログ"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                サブドメイン / スラッグ <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  placeholder="my-blog"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-transparent font-mono"
                />
                <span className="text-sm text-slate-500 font-mono">.klados.app</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                説明 (任意)
              </label>
              <input
                placeholder="サイトの概要や目的"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-transparent"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.title || !form.slug}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {createMutation.isPending ? '作成中...' : '作成する'}
              </button>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setErrorMessage('');
                }}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-sm font-medium transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.map((site) => (
          <Link
            key={site.id}
            href={`/dashboard/sites/${site.id}`}
            className="group bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 hover:shadow-md hover:border-blue-500/50 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <h2 className="font-semibold text-lg text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {site.title}
                </h2>
                <div className="flex items-center gap-1.5 shrink-0">
                  {site.is_owner === false ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                      {site.role === 'admin' ? '管理者' : site.role === 'editor' ? '編集者' : site.role === 'viewer' ? '閲覧者' : '自由権限'} (参加中)
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      オーナー
                    </span>
                  )}
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                      site.is_public
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {site.is_public ? '公開中' : '下書き'}
                  </span>
                </div>
              </div>
              <p className="text-xs font-mono text-blue-600 dark:text-blue-400 mb-3">
                {site.slug}.klados.app
              </p>
              {site.description && (
                <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                  {site.description}
                </p>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>テーマ: {site.theme || 'minimal'}</span>
              <span>編集・管理 →</span>
            </div>
          </Link>
        ))}

        {data?.length === 0 && (
          <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8">
            <Globe className="w-12 h-12 mx-auto text-slate-400 mb-3 opacity-60" />
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              作成済みのサイトはありません
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto mb-4">
              Kladosで最初のMarkdownサイトを立ち上げましょう。1分で公開できます。
            </p>
            <button
              onClick={handleOpenCreate}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors inline-flex items-center gap-1.5"
            >
              <span>+</span> 最初のサイトを作成
            </button>
          </div>
        )}
      </div>

      {/* プラン制限 / ポリシーモーダル */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-md w-full border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-semibold">
                  <Sparkles className="w-5 h-5" />
                  <span>プランと提供ポリシー</span>
                </div>
                <button
                  onClick={() => setShowPlanModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {hasReachedSiteLimit ? (
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl mb-4 text-amber-800 dark:text-amber-300 text-sm">
                  <p className="font-semibold mb-1">サイト数上限に達しています (1/1 サイト)</p>
                  <p className="text-xs opacity-90">
                    現在の無料ベータ期間中、作成可能なサイト数はアカウントあたり最大1サイトとなっております。
                  </p>
                </div>
              ) : null}

              <div className="space-y-3 mb-6">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  現在Kladosでは、当面の間<strong>サイト数（最大1サイト）以外のすべての機能が無制限</strong>で開放されています。
                </p>
                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-blue-500" />
                      サイト数
                    </span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">1 サイト</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-500" />
                      ページ作成数
                    </span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Infinity className="w-4 h-4" /> 無制限
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      カスタムドメイン
                    </span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">無制限・無料</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      リアルタイム共同編集
                    </span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">利用可能</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      サイトZIPエクスポート
                    </span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">利用可能</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowPlanModal(false)}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-sm font-medium transition-colors"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
